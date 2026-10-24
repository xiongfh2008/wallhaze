import { randomBytes, randomUUID } from "node:crypto";
import { loadEnv, loadEnvFile } from "./config/env.js";
import {
  createPostgresDatabase,
  type Database,
} from "./db/database.js";
import { migrate } from "./db/migrate.js";
import {
  assertDevDatabaseAvailable,
  closePgliteGuarded,
  openPgliteGuarded,
} from "./db/pglite-guard.js";
import {
  cleanupRetention,
  reconcileAll,
  sweepStaleJobs,
} from "./business/maintenance.js";
import { retryReceivedEvents } from "./business/payment.js";
import {
  clearAuthThrottle,
  createCredentialUser,
  resetUserPassword,
} from "./business/auth.js";
import { credit, getWallet } from "./business/wallet.js";
import { LocalStorage, MemoryStorage } from "./business/storage.js";
import { cleanupExpiredMedia } from "./business/media-lifecycle.js";

/**
 * Operations CLI (R08).
 *
 * Default run: reconcile every wallet against its ledger, release credits
 * held by jobs whose worker lease expired, replay recorded webhooks and
 * apply conservative retention cleanup.
 *
 *   npm run ops                 # sweep + cleanup + webhook replay + reconciliation
 *   npm run ops -- --no-sweep   # reconciliation + replay + cleanup only
 *   npm run ops -- --no-cleanup # keep all retention rows
 *   npm run ops -- --no-media-cleanup # skip expired-media sweep
 *   npm run ops -- --no-replay  # skip webhook replay
 *
 * Expired-media deletion is a DRY RUN unless
 * MEDIA_RETENTION_CLEANUP_ENABLED=1 and STORAGE_DIR is configured.
 *
 * Targeted recovery commands (these skip the maintenance run):
 *
 *   npm run ops -- --unlock <email>            # clear failed-login counters
 *   npm run ops -- --ensure-user <email>       # create the account if missing; prints a generated password once
 *   npm run ops -- --reset-password <email>    # new generated password; revokes sessions + unlocks
 *   npm run ops -- --grant <email> <credits>   # add credits (ledger reason `ops.grant`)
 *   npm run ops -- --wallet <email>            # print balance/reserved/debt
 *
 * Local development uses PGlite, which is single-process: stop the API
 * (`npm run stop`, graceful and backed up) before running ops. The CLI
 * refuses to open the database while the API is serving.
 */
async function main(): Promise<void> {
  loadEnvFile();
  const env = loadEnv(process.env);
  const pgliteDir =
    !env.DATABASE_URL && env.PGLITE_DIR && env.NODE_ENV !== "production"
      ? env.PGLITE_DIR
      : null;
  if (!env.DATABASE_URL && !pgliteDir) {
    console.error("[ops] DATABASE_URL or PGLITE_DIR is required");
    process.exit(1);
  }
  if (pgliteDir) {
    await assertDevDatabaseAvailable(env.PORT);
  }

  let db: Database;
  let activePgliteDir: string | null = null;
  if (env.DATABASE_URL) {
    db = createPostgresDatabase(env.DATABASE_URL);
    await migrate(db);
  } else {
    const opened = await openPgliteGuarded(pgliteDir!);
    db = opened.db;
    activePgliteDir = opened.dir;
    if (opened.repaired) {
      console.warn(
        "[ops] the previous database could not be opened; a backup (or a fresh database) was restored"
      );
    }
    await migrate(db);
  }

  try {
    const ensureUser = argValue("--ensure-user");
    const resetPassword = argValue("--reset-password");
    const grantEmail = argValue("--grant");
    const walletEmail = argValue("--wallet");
    const unlockEmail = argValue("--unlock");
    const targeted =
      ensureUser || resetPassword || grantEmail || walletEmail || unlockEmail;

    if (targeted) {
      const report = await runTargeted(db, {
        ensureUser,
        resetPassword,
        grantEmail,
        grantAmount: grantEmail ? Number(argValue("--grant", 1)) : NaN,
        walletEmail,
        unlockEmail,
      });
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const sweep = process.argv.includes("--no-sweep")
      ? { failed: 0, jobIds: [] as string[] }
      : await sweepStaleJobs(db, { staleAfterMinutes: 30 });
    const cleanup = process.argv.includes("--no-cleanup")
      ? { authAttempts: 0, webhookEvents: 0 }
      : await cleanupRetention(db);
    const cleanupEnabled = ["1", "true"].includes(
      (env.MEDIA_RETENTION_CLEANUP_ENABLED ?? "").toLowerCase()
    );
    if (cleanupEnabled && !env.STORAGE_DIR) {
      throw new Error(
        "MEDIA_RETENTION_CLEANUP_ENABLED requires STORAGE_DIR; refusing to mark files deleted without a local object store"
      );
    }
    const mediaCleanup = process.argv.includes("--no-media-cleanup")
      ? null
      : await cleanupExpiredMedia(
          db,
          env.STORAGE_DIR
            ? new LocalStorage(env.STORAGE_DIR)
            : new MemoryStorage(),
          { dryRun: !cleanupEnabled }
        );
    // Replay webhooks that were recorded but never processed (crash between
    // recording and settlement). Signature was verified before recording.
    const replayed = process.argv.includes("--no-replay")
      ? 0
      : await retryReceivedEvents(db, env.PAYMENT_PROVIDER);
    const report = await reconcileAll(db);
    console.log(
      JSON.stringify(
        {
          sweptStaleJobs: sweep.failed,
          sweptJobIds: sweep.jobIds,
          cleanedAuthAttempts: cleanup.authAttempts,
          cleanedWebhookEvents: cleanup.webhookEvents,
          mediaCleanup,
          replayedWebhookEvents: replayed,
          walletsChecked: report.checked,
          mismatches: report.mismatches,
        },
        null,
        2
      )
    );
    if (report.mismatches.length > 0) process.exitCode = 2;
  } finally {
    if (activePgliteDir) await closePgliteGuarded(db, activePgliteDir);
    else await db.close();
  }
}

/** Value of `--flag value` (offset skips the flag itself). */
function argValue(flag: string, offset = 0): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const raw = process.argv[index + 1 + offset];
  return raw && !raw.startsWith("--") ? raw : null;
}

/** 12 characters from 72 bits — meets the 8-character policy. */
function generatePassword(): string {
  return randomBytes(9).toString("base64url");
}

async function userByEmail(
  db: Database,
  email: string
): Promise<{ id: string; email: string } | undefined> {
  return (
    await db.query<{ id: string; email: string }>(
      "SELECT id,email FROM users WHERE email=$1",
      [email.trim().toLowerCase()]
    )
  ).rows[0];
}

interface TargetedOptions {
  ensureUser: string | null;
  resetPassword: string | null;
  grantEmail: string | null;
  grantAmount: number;
  walletEmail: string | null;
  unlockEmail: string | null;
}

async function runTargeted(
  db: Database,
  options: TargetedOptions
): Promise<Record<string, unknown>> {
  const report: Record<string, unknown> = {};

  if (options.unlockEmail) {
    report.unlockedAuthAttempts = await clearAuthThrottle(
      db,
      options.unlockEmail.toLowerCase()
    );
  }

  if (options.ensureUser) {
    const password = generatePassword();
    const created = await createCredentialUser(
      db,
      options.ensureUser,
      password
    );
    report.user = { email: created.email, created: created.created };
    if (created.created) {
      report.temporaryPassword = password;
      report.note =
        "Store this password now — it is not recoverable. Replace it with --reset-password once you are signed in.";
    }
  }

  if (options.resetPassword) {
    const password = generatePassword();
    const reset = await resetUserPassword(
      db,
      options.resetPassword,
      password
    );
    report.passwordReset = { email: options.resetPassword, reset };
    if (reset) report.temporaryPassword = password;
  }

  if (options.grantEmail) {
    if (!Number.isInteger(options.grantAmount) || options.grantAmount <= 0) {
      throw new Error("--grant requires a positive integer credit amount");
    }
    const user = await userByEmail(db, options.grantEmail);
    if (!user) {
      throw new Error(`No account for ${options.grantEmail}`);
    }
    // Each invocation is a distinct top-up: a fresh idempotency key means a
    // legitimate second grant is not swallowed as a replay.
    const key = `ops-grant:${randomUUID()}`;
    await db.transaction((tx) =>
      credit(tx, user.id, options.grantAmount, key, "ops.grant")
    );
    report.grant = {
      email: user.email,
      credits: options.grantAmount,
      wallet: await getWallet(db, user.id),
    };
  }

  if (options.walletEmail) {
    const user = await userByEmail(db, options.walletEmail);
    if (!user) throw new Error(`No account for ${options.walletEmail}`);
    report.wallet = { email: user.email, ...(await getWallet(db, user.id)) };
  }

  return report;
}

void main().catch((error) => {
  console.error("[ops] fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
