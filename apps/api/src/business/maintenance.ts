import type { Database } from "../db/database.js";
import { reconcile, release, type ReconcileResult } from "./wallet.js";

/**
 * Operational maintenance (R04/R05/R08).
 *
 * - `reconcileAll` re-derives every wallet from the immutable ledger and
 *   reports mismatches; it never "repairs" silently — an operator decides.
 * - `sweepStaleJobs` fails jobs whose lease expired long ago (crashed or
 *   vanished workers) and releases their held credits. Without this, a lost
 *   worker would keep a user's credits frozen indefinitely.
 */

export interface SweepResult {
  failed: number;
  jobIds: string[];
}

export async function sweepStaleJobs(
  db: Database,
  options: { staleAfterMinutes?: number; limit?: number } = {}
): Promise<SweepResult> {
  const staleAfterMinutes = options.staleAfterMinutes ?? 30;
  const limit = options.limit ?? 100;
  if (!Number.isFinite(staleAfterMinutes) || staleAfterMinutes <= 0) {
    throw new Error("staleAfterMinutes must be positive");
  }
  const rows = (
    await db.query<{ id: string }>(
      `SELECT id FROM generation_jobs
       WHERE status='running'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at < now() - ($1::text)::interval
       ORDER BY lease_expires_at
       LIMIT $2`,
      [`${staleAfterMinutes} minutes`, limit]
    )
  ).rows;

  const failed: string[] = [];
  for (const row of rows) {
    const swept = await db.transaction(async (tx) => {
      const job = (
        await tx.query<{
          id: string;
          user_id: string;
          status: string;
          lease_expires_at: Date | string | null;
          cost_micros: number | string;
        }>(
          "SELECT id,user_id,status,lease_expires_at,cost_micros FROM generation_jobs WHERE id=$1 FOR UPDATE",
          [row.id]
        )
      ).rows[0];
      if (!job || job.status !== "running" || job.lease_expires_at === null) {
        return false;
      }
      const expiresAt =
        job.lease_expires_at instanceof Date
          ? job.lease_expires_at.getTime()
          : new Date(job.lease_expires_at).getTime();
      if (expiresAt > Date.now() - staleAfterMinutes * 60 * 1000) return false;
      await release(tx, job.user_id, job.id);
      await tx.query(
        `UPDATE generation_budgets SET reserved=GREATEST(reserved-$2,0)
         WHERE day=CURRENT_DATE AND scope='user' AND scope_id=$1`,
        [job.user_id, Number(job.cost_micros)]
      );
      await tx.query(
        "UPDATE generation_jobs SET status='failed',request=request - 'refImage',error_code='WORKER_LOST',updated_at=now() WHERE id=$1",
        [job.id]
      );
      await tx.query(
        `UPDATE generation_attempts SET status='abandoned',finished_at=now()
         WHERE job_id=$1 AND status='running'`,
        [job.id]
      );
      return true;
    });
    if (swept) failed.push(row.id);
  }
  return { failed: failed.length, jobIds: failed };
}

export interface ReconcileAllResult {
  checked: number;
  mismatches: Array<{ userId: string } & ReconcileResult>;
}

/** Checks every wallet against its ledger; no automatic correction. */
export async function reconcileAll(db: Database): Promise<ReconcileAllResult> {
  const users = (
    await db.query<{ user_id: string }>("SELECT user_id FROM credit_wallets ORDER BY user_id")
  ).rows;
  const mismatches: Array<{ userId: string } & ReconcileResult> = [];
  for (const user of users) {
    const result = await db.transaction((tx) => reconcile(tx, user.user_id));
    if (!result.matches) mismatches.push({ userId: user.user_id, ...result });
  }
  return { checked: users.length, mismatches };
}

export interface CleanupResult {
  authAttempts: number;
  webhookEvents: number;
}

/**
 * Retention cleanup. Deliberately conservative:
 * - auth_attempts older than 24 h (throttling state only);
 * - PROCESSED webhook events older than 90 days (the order/ledger rows
 *   remain the financial record; `received`/`failed` rows are kept for
 *   investigation);
 * Ledger rows, orders, payments and jobs are never deleted here.
 */
export async function cleanupRetention(
  db: Database,
  options: {
    authAttemptsHours?: number;
    webhookEventsDays?: number;
  } = {}
): Promise<CleanupResult> {
  const authAttemptsHours = options.authAttemptsHours ?? 24;
  const webhookEventsDays = options.webhookEventsDays ?? 90;

  const attempts = (
    await db.query<{ bucket: string }>(
      "DELETE FROM auth_attempts WHERE window_start < now() - ($1::text)::interval RETURNING bucket",
      [`${authAttemptsHours} hours`]
    )
  ).rows;
  const webhooks = (
    await db.query<{ event_id: string }>(
      "DELETE FROM payment_webhook_events WHERE status='processed' AND received_at < now() - ($1::text)::interval RETURNING event_id",
      [`${webhookEventsDays} days`]
    )
  ).rows;
  return {
    authAttempts: attempts.length,
    webhookEvents: webhooks.length,
  };
}
