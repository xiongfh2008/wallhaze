import { loadEnvFile, loadEnv } from "../config/env.js";
import { createPostgresDatabase, type Database } from "../db/database.js";
import { cleanupRetention } from "../business/maintenance.js";

/**
 * Scheduled DB retention cleanup (privacy policy):
 *  - auth_attempts older than 24 h (throttling buckets only);
 *  - payment_webhook_events older than 90 days with status='processed'
 *    ('received'/'failed' rows are kept for investigation).
 *
 * Deliberately SEPARATE from ops.ts: this entry exposes exactly one
 * maintenance operation, touches no wallet/order/ledger rows, takes no
 * arguments and is safe to run repeatedly (plain conditional DELETEs, no
 * state left behind). Designed for the compose `db-retention` loop service.
 *
 * Run: node dist/<entry>/db-retention.js   (hourly)
 */
async function main(): Promise<void> {
  loadEnvFile();
  const env = loadEnv(process.env);
  if (!env.DATABASE_URL) {
    console.error("[db-retention] DATABASE_URL is required");
    process.exit(1);
  }

  let db: Database | undefined;
  try {
    db = createPostgresDatabase(env.DATABASE_URL);
    const result = await cleanupRetention(db);
    // No user data, no credentials — bucket counts and row counts only.
    console.log(
      `[db-retention] ok authAttempts=${result.authAttempts} webhookEvents=${result.webhookEvents}`
    );
  } catch (error) {
    console.error(
      `[db-retention] failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  } finally {
    await db?.close();
  }
}

main();
