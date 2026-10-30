import { loadEnvFile, loadEnv } from "../config/env.js";
import { resolveR2StorageStrict } from "../business/r2-storage.js";
import { cleanupExpiredMedia } from "../business/media-lifecycle.js";
import { createPostgresDatabase, type Database } from "../db/database.js";

/**
 * Scheduled expired-media cleanup against the real Cloudflare R2 adapter
 * only; no LocalStorage or MemoryStorage fallback.
 *
 * Safety properties (enforced here and inside cleanupExpiredMedia):
 *  - Dry-run unless MEDIA_RETENTION_CLEANUP_ENABLED is explicitly "1"/"true".
 *  - Fail-closed: STORAGE_DRIVER=r2 with incomplete R2_* credentials refuses
 *    to start (resolveStorageFromEnv) — it can never fake a deletion.
 *  - Only retention_policy='temporary_30d' AND expired rows are selected;
 *    legacy/official/community assets are never touched.
 *  - Objects are deleted BEFORE the DB row is marked 'deleted'; a failed
 *    object delete leaves 'delete_failed' with the (redacted) reason and is
 *    retried on a later pass. R2 DELETE of an already-missing key is
 *    treated as success (idempotent crash recovery).
 *  - Concurrency-safe: rows are claimed with FOR UPDATE SKIP LOCKED and a
 *    'deleting' state with a stale-claim window, so overlapping schedules
 *    or a lost container never double-delete.
 *
 * Run: node dist/<entry>/media-retention.js   (every 30 minutes)
 */
async function main(): Promise<void> {
  loadEnvFile();
  const env = loadEnv(process.env);
  if (!env.DATABASE_URL) {
    console.error("[media-retention] DATABASE_URL is required");
    process.exit(1);
  }

  const enabled = ["1", "true"].includes(
    (env.MEDIA_RETENTION_CLEANUP_ENABLED ?? "").toLowerCase()
  );
  const dryRun = !enabled;

  // Fail-closed storage resolution. This entry ONLY runs against R2: with
  // STORAGE_DRIVER unset/local, or any missing R2_* variable, it throws
  // BEFORE any DB write — a scheduled run can never mark an object deleted
  // that was not actually deleted in storage, nor silently switch drivers.
  const storage = resolveR2StorageStrict(env);

  let db: Database | undefined;
  try {
    db = createPostgresDatabase(env.DATABASE_URL);
    const result = await cleanupExpiredMedia(db, storage, {
      dryRun,
      limit: 100,
    });
    console.log(
      `[media-retention] ok dryRun=${result.dryRun} scanned=${result.scanned} ` +
        `deleted=${result.deleted} failed=${result.failed} runId=${result.runId}`
    );
    if (result.failed > 0) {
      // Redacted: safe error codes + HTTP status only (asset ids and run id
      // are non-sensitive correlation ids). Raw exception text never reaches
      // the log or the DB.
      for (const item of result.errors) {
        console.error(
          `[media-retention] delete_failed asset=${item.assetId} ` +
            `code=${item.code}${item.status !== null ? ` status=${item.status}` : ""}`
        );
      }
      // Non-zero exit so the container log surfaces repeated failures.
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      `[media-retention] failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  } finally {
    await db?.close();
  }
}

main();
