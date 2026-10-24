import { randomUUID } from "node:crypto";
import type { Sql } from "../db/database.js";
import { AppError } from "../errors/app-error.js";

/**
 * Transactional credit ledger (R04).
 *
 * Invariants enforced here and verified by tests/wallet.test.ts:
 * - every balance/reserved/debt change is mirrored by an immutable
 *   credit_ledger row (the DB trigger rejects UPDATE/DELETE) with a
 *   per-user unique idempotency key;
 * - wallet mutations only happen while the wallet row is locked
 *   (SELECT ... FOR UPDATE), so competing reservations serialize;
 * - settlement (capture/release) is terminal-state driven: a second
 *   capture, a release after capture and a capture after release are
 *   all no-ops — one job can never be settled twice;
 * - refunds that exceed the available balance record the shortfall as
 *   debt and suspend the user, freezing further spending.
 *
 * All functions take the Sql handle (db or transaction client) so the
 * caller controls transaction boundaries.
 */

export interface WalletSnapshot {
  credits: number;
  reserved: number;
  debt: number;
}

export interface ReconcileResult {
  matches: boolean;
  expected: WalletSnapshot;
  actual: WalletSnapshot;
}

interface WalletRow {
  [key: string]: unknown;
  balance: number | string;
  reserved: number | string;
  debt: number | string;
}

interface LedgerRow {
  [key: string]: unknown;
  id: string;
  amount: number | string;
}

interface ReservationRow {
  [key: string]: unknown;
  job_id: string;
  user_id: string;
  amount: number | string;
  status: string;
}

const num = (value: number | string): number => Number(value);

/** Creates the wallet row if absent, then locks it for this transaction. */
async function lockWallet(tx: Sql, userId: string): Promise<WalletRow> {
  await tx.query(
    "INSERT INTO credit_wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",
    [userId]
  );
  const rows = (
    await tx.query<WalletRow>(
      "SELECT balance,reserved,debt FROM credit_wallets WHERE user_id=$1 FOR UPDATE",
      [userId]
    )
  ).rows;
  return rows[0];
}

async function lockReservation(
  tx: Sql,
  jobId: string
): Promise<ReservationRow> {
  const rows = (
    await tx.query<ReservationRow>(
      "SELECT job_id,user_id,amount,status FROM credit_reservations WHERE job_id=$1 FOR UPDATE",
      [jobId]
    )
  ).rows;
  if (!rows[0]) {
    throw new AppError("NOT_FOUND", `No credit reservation for job ${jobId}`);
  }
  return rows[0];
}

async function findLedger(
  tx: Sql,
  userId: string,
  idempotencyKey: string
): Promise<LedgerRow | undefined> {
  return (
    await tx.query<LedgerRow>(
      "SELECT id,amount FROM credit_ledger WHERE user_id=$1 AND idempotency_key=$2",
      [userId, idempotencyKey]
    )
  ).rows[0];
}

async function appendLedger(
  tx: Sql,
  userId: string,
  idempotencyKey: string,
  reason: string,
  amount: number,
  deltas: { balance?: number; reserved?: number; debt?: number }
): Promise<void> {
  await tx.query(
    "INSERT INTO credit_ledger(id,user_id,idempotency_key,reason,amount,balance_delta,reserved_delta,debt_delta) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      randomUUID(),
      userId,
      idempotencyKey,
      reason,
      amount,
      deltas.balance ?? 0,
      deltas.reserved ?? 0,
      deltas.debt ?? 0,
    ]
  );
}

function assertPositiveAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Credit amount must be a positive integer"
    );
  }
}

/** Wallet snapshot for reads; a user without a wallet row reports zeros. */
export async function getWallet(db: Sql, userId: string): Promise<WalletSnapshot> {
  const row = (
    await db.query<WalletRow>(
      "SELECT balance,reserved,debt FROM credit_wallets WHERE user_id=$1",
      [userId]
    )
  ).rows[0];
  return row
    ? {
        credits: num(row.balance),
        reserved: num(row.reserved),
        debt: num(row.debt),
      }
    : { credits: 0, reserved: 0, debt: 0 };
}

/**
 * Credits (tops up) the wallet. Idempotent per (user, key): replaying the
 * same amount is a no-op; the same key with a DIFFERENT amount is rejected.
 * Outstanding debt is repaid first — only the remainder reaches the balance.
 */
export async function credit(
  tx: Sql,
  userId: string,
  amount: number,
  idempotencyKey: string,
  reason: string
): Promise<void> {
  assertPositiveAmount(amount);
  if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Idempotency key is required");
  }
  const wallet = await lockWallet(tx, userId);
  const prior = await findLedger(tx, userId, idempotencyKey);
  if (prior) {
    if (num(prior.amount) === amount) return;
    throw new AppError(
      "CONFLICT",
      `idempotency key already applied with amount ${num(prior.amount)}`
    );
  }
  const repay = Math.min(num(wallet.debt), amount);
  const credited = amount - repay;
  await appendLedger(tx, userId, idempotencyKey, reason, amount, {
    balance: credited,
    debt: -repay,
  });
  await tx.query(
    "UPDATE credit_wallets SET balance=balance+$1,debt=debt-$2,updated_at=now() WHERE user_id=$3",
    [credited, repay, userId]
  );
}

/**
 * Holds `amount` credits for a generation job. Moves balance → reserved and
 * records the reservation against the job (unique PK). Idempotent while the
 * reservation is still held with the same amount; rejects once terminal or
 * when the amount changed. Spending is frozen while the user is suspended or
 * carries refund debt.
 */
export async function reserve(
  tx: Sql,
  userId: string,
  jobId: string,
  amount: number
): Promise<void> {
  assertPositiveAmount(amount);
  const existing = (
    await tx.query<ReservationRow>(
      "SELECT job_id,user_id,amount,status FROM credit_reservations WHERE job_id=$1",
      [jobId]
    )
  ).rows[0];
  if (existing) {
    if (existing.status === "held" && num(existing.amount) === amount) return;
    throw new AppError(
      "CONFLICT",
      `idempotency conflict: reservation for job ${jobId} is ${existing.status}`
    );
  }
  const wallet = await lockWallet(tx, userId);
  const user = (
    await tx.query<{ status: string }>("SELECT status FROM users WHERE id=$1", [
      userId,
    ])
  ).rows[0];
  if (!user) throw new AppError("NOT_FOUND", "User not found");
  if (num(wallet.debt) > 0 || user.status === "suspended") {
    throw new AppError(
      "FORBIDDEN",
      "Spending is frozen while credit debt is outstanding"
    );
  }
  if (num(wallet.balance) - num(wallet.reserved) < amount) {
    throw new AppError("CONFLICT", "Insufficient credits");
  }
  await tx.query(
    "INSERT INTO credit_reservations(job_id,user_id,amount) VALUES($1,$2,$3)",
    [jobId, userId, amount]
  );
  await appendLedger(
    tx,
    userId,
    `reserve:${jobId}`,
    "generation.reserved",
    amount,
    { reserved: amount }
  );
  await tx.query(
    "UPDATE credit_wallets SET reserved=reserved+$1,updated_at=now() WHERE user_id=$2",
    [amount, userId]
  );
}

/**
 * Consumes a held reservation (generation succeeded). Terminal: repeated
 * captures are no-ops, and a release after capture never refunds.
 */
export async function capture(
  tx: Sql,
  userId: string,
  jobId: string
): Promise<void> {
  const reservation = await lockReservation(tx, jobId);
  if (reservation.user_id !== userId) {
    throw new AppError("NOT_FOUND", `No credit reservation for job ${jobId}`);
  }
  if (reservation.status !== "held") return;
  const amount = num(reservation.amount);
  await lockWallet(tx, userId);
  await appendLedger(
    tx,
    userId,
    `capture:${jobId}`,
    "generation.captured",
    amount,
    { balance: -amount, reserved: -amount }
  );
  await tx.query(
    "UPDATE credit_wallets SET balance=balance-$1,reserved=reserved-$1,updated_at=now() WHERE user_id=$2",
    [amount, userId]
  );
  await tx.query(
    "UPDATE credit_reservations SET status='captured',updated_at=now() WHERE job_id=$1",
    [jobId]
  );
}

/**
 * Releases a held reservation back to the balance (generation failed).
 * Terminal: repeated releases are no-ops, and a capture after release is a
 * no-op too — settlement happens exactly once.
 */
export async function release(
  tx: Sql,
  userId: string,
  jobId: string,
  reason = "generation.released"
): Promise<void> {
  const reservation = await lockReservation(tx, jobId);
  if (reservation.user_id !== userId) {
    throw new AppError("NOT_FOUND", `No credit reservation for job ${jobId}`);
  }
  if (reservation.status !== "held") return;
  const amount = num(reservation.amount);
  await lockWallet(tx, userId);
  await appendLedger(
    tx,
    userId,
    `release:${jobId}`,
    reason,
    amount,
    { reserved: -amount }
  );
  await tx.query(
    "UPDATE credit_wallets SET reserved=reserved-$1,updated_at=now() WHERE user_id=$2",
    [amount, userId]
  );
  await tx.query(
    "UPDATE credit_reservations SET status='released',updated_at=now() WHERE job_id=$1",
    [jobId]
  );
}

/**
 * Refunds credits (e.g. a paid order reversal). Refunds only what is
 * available (balance minus reserved — held funds belong to running jobs);
 * the shortfall is recorded as debt and suspends the user, freezing
 * spending until the debt is repaid by later top-ups.
 */
export async function refund(
  tx: Sql,
  userId: string,
  amount: number,
  idempotencyKey: string,
  reason = "refund"
): Promise<void> {
  assertPositiveAmount(amount);
  const wallet = await lockWallet(tx, userId);
  const prior = await findLedger(tx, userId, idempotencyKey);
  if (prior) {
    if (num(prior.amount) === amount) return;
    throw new AppError(
      "CONFLICT",
      `idempotency key already applied with amount ${num(prior.amount)}`
    );
  }
  const available = num(wallet.balance) - num(wallet.reserved);
  const taken = Math.max(0, Math.min(available, amount));
  const shortfall = amount - taken;
  await appendLedger(tx, userId, idempotencyKey, reason, amount, {
    balance: -taken,
    debt: shortfall,
  });
  await tx.query(
    "UPDATE credit_wallets SET balance=balance-$1,debt=debt+$2,updated_at=now() WHERE user_id=$3",
    [taken, shortfall, userId]
  );
  if (shortfall > 0) {
    await tx.query(
      "UPDATE users SET status='suspended' WHERE id=$1 AND status='active'",
      [userId]
    );
  }
}

/**
 * Reconciliation: the wallet row must equal the sum of immutable ledger
 * deltas. Any mismatch means manual tampering or a bookkeeping bug.
 */
export async function reconcile(
  tx: Sql,
  userId: string
): Promise<ReconcileResult> {
  const sums = (
    await tx.query<{
      balance: number | string;
      reserved: number | string;
      debt: number | string;
    }>(
      `SELECT COALESCE(SUM(balance_delta),0)::int AS balance,
              COALESCE(SUM(reserved_delta),0)::int AS reserved,
              COALESCE(SUM(debt_delta),0)::int AS debt
       FROM credit_ledger WHERE user_id=$1`,
      [userId]
    )
  ).rows[0];
  const row = (
    await tx.query<WalletRow>(
      "SELECT balance,reserved,debt FROM credit_wallets WHERE user_id=$1",
      [userId]
    )
  ).rows[0];
  const expected: WalletSnapshot = {
    credits: num(sums.balance),
    reserved: num(sums.reserved),
    debt: num(sums.debt),
  };
  const actual: WalletSnapshot = row
    ? {
        credits: num(row.balance),
        reserved: num(row.reserved),
        debt: num(row.debt),
      }
    : { credits: 0, reserved: 0, debt: 0 };
  return {
    matches:
      expected.credits === actual.credits &&
      expected.reserved === actual.reserved &&
      expected.debt === actual.debt,
    expected,
    actual,
  };
}
