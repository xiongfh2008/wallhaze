import { randomUUID } from "node:crypto";
import type { Database } from "../db/database.js";
import type { PrivateStorage } from "./storage.js";

/** New user-generated assets are kept in cloud storage for 30 days. */
export const MEDIA_RETENTION_DAYS = 30;
/** Retry a failed object deletion on up to three separate cleanup passes. */
export const DELETE_RETRY_LIMIT = 3;

export type RetentionPolicy = "legacy" | "temporary_30d";
export type StorageStatus = "active" | "deleting" | "deleted" | "delete_failed";
export type RetentionState =
  | "legacy"
  | "active"
  | "expired"
  | "deleting"
  | "deleted"
  | "delete_failed";

export interface RetentionFields {
  expiresAt: string | null;
  retentionPolicy: RetentionPolicy;
  storageStatus: StorageStatus;
}

/**
 * Access is allowed for legacy rows that are still stored, and for temporary
 * rows only before expiresAt. A signed URL is not enough after expiry.
 */
export function isAssetAccessible(
  asset: RetentionFields,
  nowMs = Date.now()
): boolean {
  if (asset.storageStatus !== "active") return false;
  if (asset.retentionPolicy === "legacy") return true;
  if (!asset.expiresAt) return false;
  const expires = Date.parse(asset.expiresAt);
  return Number.isFinite(expires) && expires > nowMs;
}

export function retentionState(
  asset: RetentionFields,
  nowMs = Date.now()
): RetentionState {
  if (asset.retentionPolicy === "legacy") return "legacy";
  if (asset.storageStatus === "deleted") return "deleted";
  if (asset.storageStatus === "deleting") return "deleting";
  if (asset.storageStatus === "delete_failed") return "delete_failed";
  if (!asset.expiresAt) return "active";
  const expires = Date.parse(asset.expiresAt);
  return Number.isFinite(expires) && expires <= nowMs ? "expired" : "active";
}

export interface MediaCleanupOptions {
  /** Controlled clock for tests and scheduled runs. */
  now?: Date;
  limit?: number;
  retryLimit?: number;
  /**
   * Safe default: true. The ops CLI only passes false when the explicit
   * MEDIA_RETENTION_CLEANUP_ENABLED flag is set.
   */
  dryRun?: boolean;
}

export interface MediaCleanupResult {
  runId: string;
  dryRun: boolean;
  scanned: number;
  deleted: number;
  failed: number;
  assetIds: string[];
  errors: Array<{ assetId: string; error: string }>;
}

interface CandidateRow {
  [key: string]: unknown;
  id: string;
  job_id: string;
  storage_key: string;
  poster_storage_key: string | null;
  delete_attempts: number | string;
  storage_status: string;
  expires_at: Date | string | null;
}

/**
 * Deletes expired temporary media objects and keeps the asset row as minimal
 * audit history. Idempotent by design:
 * - only retention_policy='temporary_30d' rows are selected;
 * - legacy/official gallery data is never touched;
 * - a row is claimed as 'deleting' before storage I/O, so concurrent passes
 *   cannot delete the same object twice;
 * - storage.delete is retried on later passes after delete_failed;
 * - a crash after object deletion leaves 'deleting', which a later pass
 *   re-deletes safely (LocalStorage ignores ENOENT) and marks deleted.
 */
export async function cleanupExpiredMedia(
  db: Database,
  storage: PrivateStorage,
  options: MediaCleanupOptions = {}
): Promise<MediaCleanupResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 100;
  const retryLimit = options.retryLimit ?? DELETE_RETRY_LIMIT;
  const dryRun = options.dryRun ?? true;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer");
  }
  if (!Number.isInteger(retryLimit) || retryLimit <= 0) {
    throw new Error("retryLimit must be a positive integer");
  }

  const runId = randomUUID();
  await db.query(
    "INSERT INTO media_cleanup_runs(id,dry_run) VALUES($1,$2)",
    [runId, dryRun]
  );

  let scanned = 0;
  let deleted = 0;
  let failed = 0;
  const assetIds: string[] = [];
  const errors: Array<{ assetId: string; error: string }> = [];

  if (dryRun) {
    const rows = (
      await db.query<CandidateRow>(
        `SELECT id,job_id,storage_key,poster_storage_key,delete_attempts,storage_status,expires_at
         FROM image_assets
         WHERE retention_policy='temporary_30d'
           AND expires_at IS NOT NULL
           AND expires_at <= $1
           AND delete_attempts < $2
           AND (
             storage_status='active'
             OR (storage_status='deleting' AND updated_at < $1::timestamptz - interval '10 minutes')
             OR (storage_status='delete_failed' AND updated_at < $1::timestamptz - interval '30 seconds')
           )
         ORDER BY expires_at
         LIMIT $3`,
        [now.toISOString(), retryLimit, limit]
      )
    ).rows;
    scanned = rows.length;
    assetIds.push(...rows.map((row) => row.id));
  } else {
    for (let index = 0; index < limit; index += 1) {
      const claimed = await db.transaction(async (tx) => {
        const row = (
          await tx.query<CandidateRow>(
            `SELECT id,job_id,storage_key,poster_storage_key,delete_attempts,storage_status,expires_at
             FROM image_assets
             WHERE retention_policy='temporary_30d'
               AND expires_at IS NOT NULL
               AND expires_at <= $1
               AND delete_attempts < $2
               AND (
                 storage_status='active'
                 OR (storage_status='deleting' AND updated_at < $1::timestamptz - interval '10 minutes')
                 OR (storage_status='delete_failed' AND updated_at < $1::timestamptz - interval '30 seconds')
               )
             ORDER BY expires_at
             LIMIT 1
             FOR UPDATE SKIP LOCKED`,
            [now.toISOString(), retryLimit]
          )
        ).rows[0];
        if (!row) return null;
        await tx.query(
          "UPDATE image_assets SET storage_status='deleting',updated_at=now() WHERE id=$1",
          [row.id]
        );
        return row;
      });
      if (!claimed) break;
      scanned += 1;
      assetIds.push(claimed.id);
      try {
        if (claimed.poster_storage_key) {
          await storage.delete(claimed.poster_storage_key);
        }
        await storage.delete(claimed.storage_key);
        await db.query(
          `UPDATE image_assets
           SET storage_status='deleted',deleted_at=now(),delete_attempts=delete_attempts+1,
               last_cleanup_error=NULL,updated_at=now()
           WHERE id=$1 AND retention_policy='temporary_30d'`,
          [claimed.id]
        );
        deleted += 1;
      } catch (error) {
        const message = (
          error instanceof Error ? error.message : String(error)
        ).slice(0, 200);
        await db.query(
          `UPDATE image_assets
           SET storage_status='delete_failed',delete_attempts=delete_attempts+1,
               last_cleanup_error=$2,updated_at=now()
           WHERE id=$1 AND retention_policy='temporary_30d'`,
          [claimed.id, message]
        );
        failed += 1;
        errors.push({ assetId: claimed.id, error: message });
        // Retry on a later cleanup pass, not immediately in this one.
        break;
      }
    }
  }

  await db.query(
    `UPDATE media_cleanup_runs
     SET finished_at=now(),scanned=$2,deleted=$3,failed=$4,details=$5::jsonb
     WHERE id=$1`,
    [
      runId,
      scanned,
      deleted,
      failed,
      JSON.stringify({ assetIds, errors, limit, retryLimit }),
    ]
  );

  return { runId, dryRun, scanned, deleted, failed, assetIds, errors };
}
