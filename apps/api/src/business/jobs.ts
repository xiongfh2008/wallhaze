import { randomUUID, randomBytes } from "node:crypto";
import type { Database, Sql } from "../db/database.js";
import { AppError } from "../errors/app-error.js";
import { reserve, capture, release } from "./wallet.js";

/**
 * Async generation job state machine (R05).
 *
 * Lifecycle: queued → running (lease) → succeeded | failed.
 * - Persisting the job AND its credit reservation happens in ONE
 *   transaction: no job exists without a held reservation, and an
 *   insufficient balance leaves no orphan job row.
 * - Workers claim with FOR UPDATE SKIP LOCKED and a lease (token, owner,
 *   expiry). An expired lease makes the job claimable again; the attempt
 *   counter increments and the old lease token becomes invalid — a stale
 *   worker's completion/failure is fenced off (CONFLICT).
 * - Settlement is lease-verified: capture on success, release on failure.
 *   A completion replay after success is rejected — one job settles once.
 * - Persisted daily cost budgets (generation_budgets) are checked before
 *   any reservation; provider cost is moved reserved → spent on success
 *   and, conservatively, retained as spent when a call may have been
 *   billed (timeouts, storage failures after the provider call).
 */

export interface EnqueueJobInput {
  userId: string;
  idempotencyKey: string;
  /** Provider-agnostic request payload (stored as JSONB). */
  request: unknown;
  inputHash: string;
  /** Credits the user pays for this job (reserved immediately). */
  price: number;
  /** Upper bound of provider cost for budget accounting (micro units). */
  costMicros: number;
  /** Unified media/job identity; legacy callers default to image/text_to_image. */
  mediaType?: "image" | "video";
  generationMode?:
    | "text_to_image"
    | "image_edit"
    | "text_to_video"
    | "image_to_video";
  durationSeconds?: number | null;
  sourceCreationId?: string | null;
  width?: number | null;
  height?: number | null;
  /** Optional persisted daily cost budget for the user (micro units). */
  userDailyCostMicrosLimit?: number;
  /** Optional platform-wide daily cost budget (micro units). 0 = hard stop. */
  platformDailyCostMicrosLimit?: number;
}

export interface JobRecord {
  id: string;
  userId: string;
  status: string;
  credits: number;
  costMicros: number;
  createdAt: string;
  mediaType: "image" | "video";
  generationMode: string;
  durationSeconds: number | null;
  sourceCreationId: string | null;
  width: number | null;
  height: number | null;
}

export interface ClaimedJob {
  jobId: string;
  userId: string;
  attempt: number;
  leaseToken: string;
  leaseExpiresAt: string;
  request: unknown;
  mediaType: "image" | "video";
  generationMode: string;
  durationSeconds: number | null;
}

interface JobRow {
  [key: string]: unknown;
  id: string;
  user_id: string;
  request: unknown;
  status: string;
  credits: number | string;
  cost_micros: number | string;
  attempt: number | string;
  lease_token: string | null;
  lease_expires_at: Date | string | null;
  error_code: string | null;
  created_at: Date | string;
  media_type: string | null;
  generation_mode: string | null;
  duration_seconds: number | string | null;
  source_creation_id: string | null;
  width: number | string | null;
  height: number | string | null;
}

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function assertJobInput(input: EnqueueJobInput): void {
  if (typeof input.userId !== "string" || input.userId.length === 0) {
    throw new AppError("VALIDATION_ERROR", "userId is required");
  }
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length === 0
  ) {
    throw new AppError("VALIDATION_ERROR", "idempotencyKey is required");
  }
  if (input.request === null || typeof input.request !== "object") {
    throw new AppError("VALIDATION_ERROR", "request must be an object");
  }
  if (!Number.isInteger(input.price) || input.price <= 0) {
    throw new AppError("VALIDATION_ERROR", "price must be a positive integer");
  }
  if (!Number.isInteger(input.costMicros) || input.costMicros <= 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "costMicros must be a positive integer"
    );
  }
  if (input.durationSeconds != null && ![3, 4, 5].includes(input.durationSeconds)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "durationSeconds must be 3, 4 or 5"
    );
  }
}

async function findJobByIdempotencyKey(
  tx: Sql,
  userId: string,
  idempotencyKey: string
): Promise<JobRow | undefined> {
  return (
    await tx.query<JobRow>(
      "SELECT * FROM generation_jobs WHERE user_id=$1 AND idempotency_key=$2",
      [userId, idempotencyKey]
    )
  ).rows[0];
}

function toRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    credits: Number(row.credits),
    costMicros: Number(row.cost_micros),
    createdAt: iso(row.created_at),
    mediaType: row.media_type === "video" ? "video" : "image",
    generationMode: row.generation_mode ?? "text_to_image",
    durationSeconds:
      row.duration_seconds === null || row.duration_seconds === undefined
        ? null
        : Number(row.duration_seconds),
    sourceCreationId: row.source_creation_id ?? null,
    width: row.width === null || row.width === undefined ? null : Number(row.width),
    height: row.height === null || row.height === undefined ? null : Number(row.height),
  };
}

/** Atomically persists the job, its budget charge and the credit hold. */
export async function enqueueJob(
  db: Database,
  input: EnqueueJobInput
): Promise<{ job: JobRecord; deduped: boolean }> {
  assertJobInput(input);
  return db.transaction(async (tx) => {
    const existing = await findJobByIdempotencyKey(
      tx,
      input.userId,
      input.idempotencyKey
    );
    if (existing) return { job: toRecord(existing), deduped: true };

    if (input.userDailyCostMicrosLimit !== undefined) {
      const budget = (
        await tx.query<{ reserved: number | string; spent: number | string }>(
          "SELECT reserved,spent FROM generation_budgets WHERE day=CURRENT_DATE AND scope='user' AND scope_id=$1 FOR UPDATE",
          [input.userId]
        )
      ).rows[0];
      const committed =
        (budget ? Number(budget.reserved) + Number(budget.spent) : 0);
      if (committed + input.costMicros > input.userDailyCostMicrosLimit) {
        throw new AppError(
          "RATE_LIMITED",
          "Daily AI cost budget exceeded — try again tomorrow",
          { retryAfterSeconds: 3600 }
        );
      }
    }

    if (input.platformDailyCostMicrosLimit !== undefined) {
      const budget = (
        await tx.query<{ reserved: number | string; spent: number | string }>(
          "SELECT reserved,spent FROM generation_budgets WHERE day=CURRENT_DATE AND scope='platform' AND scope_id='global' FOR UPDATE"
        )
      ).rows[0];
      const committed =
        (budget ? Number(budget.reserved) + Number(budget.spent) : 0);
      if (committed + input.costMicros > input.platformDailyCostMicrosLimit) {
        throw new AppError(
          "SERVICE_UNAVAILABLE",
          "The platform AI budget is exhausted — try again later",
          { retryAfterSeconds: 3600 }
        );
      }
    }

    await tx.query(
      `INSERT INTO generation_budgets(day,scope,scope_id,reserved,spent)
       VALUES(CURRENT_DATE,'user',$1,$2,0)
       ON CONFLICT (day,scope,scope_id) DO UPDATE SET reserved=generation_budgets.reserved+$2`,
      [input.userId, input.costMicros]
    );

    if (input.platformDailyCostMicrosLimit !== undefined) {
      await tx.query(
        `INSERT INTO generation_budgets(day,scope,scope_id,reserved,spent)
         VALUES(CURRENT_DATE,'platform','global',$1,0)
         ON CONFLICT (day,scope,scope_id) DO UPDATE SET reserved=generation_budgets.reserved+$1`,
        [input.costMicros]
      );
    }

    const jobId = randomUUID();
    let row: JobRow;
    try {
      row = (
        await tx.query<JobRow>(
          `INSERT INTO generation_jobs(
             id,user_id,request,input_hash,idempotency_key,credits,cost_micros,
             media_type,generation_mode,duration_seconds,source_creation_id,width,height
           )
           VALUES($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [
            jobId,
            input.userId,
            JSON.stringify(input.request),
            input.inputHash,
            input.idempotencyKey,
            input.price,
            input.costMicros,
            input.mediaType ?? "image",
            input.generationMode ?? "text_to_image",
            input.durationSeconds ?? null,
            input.sourceCreationId ?? null,
            input.width ?? null,
            input.height ?? null,
          ]
        )
      ).rows[0];
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "23505"
      ) {
        const raced = await findJobByIdempotencyKey(
          tx,
          input.userId,
          input.idempotencyKey
        );
        if (raced) return { job: toRecord(raced), deduped: true };
      }
      throw error;
    }
    // The reservation moves balance→reserved inside the same transaction;
    // an insufficient balance rolls the whole job back.
    await reserve(tx, input.userId, jobId, input.price);
    return { job: toRecord(row), deduped: false };
  });
}

/** Pauses the whole pipeline (operator switch, mirrors legacy semantics). */
async function isPaused(db: Database): Promise<boolean> {
  const row = (
    await db.query<{ paused: boolean }>(
      "SELECT paused FROM generation_control WHERE id=1"
    )
  ).rows[0];
  return Boolean(row?.paused);
}

/**
 * Claims one queued (or lease-expired) job exclusively. Returns null when
 * nothing is claimable or the pipeline is paused.
 */
export async function claimJob(
  db: Database,
  options: { workerId: string; leaseSeconds: number }
): Promise<ClaimedJob | null> {
  if (await isPaused(db)) return null;
  if (
    !Number.isFinite(options.leaseSeconds) ||
    options.leaseSeconds <= 0 ||
    typeof options.workerId !== "string" ||
    options.workerId.length === 0
  ) {
    throw new AppError("VALIDATION_ERROR", "workerId and leaseSeconds are required");
  }
  return db.transaction(async (tx) => {
    const row = (
      await tx.query<JobRow>(
        `SELECT * FROM generation_jobs
         WHERE deleted_at IS NULL AND (
               status='queued'
               OR (status='running' AND lease_expires_at < now()))
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      )
    ).rows[0];
    if (!row) return null;
    const attempt = Number(row.attempt) + 1;
    const leaseToken = randomBytes(24).toString("base64url");
    const updated = (
      await tx.query<JobRow>(
        `UPDATE generation_jobs
         SET status='running',attempt=$2,lease_token=$3,lease_owner=$4,
             lease_expires_at=now()+($5::text)::interval,error_code=NULL,updated_at=now()
         WHERE id=$1 RETURNING *`,
        [row.id, attempt, leaseToken, options.workerId, `${options.leaseSeconds} seconds`]
      )
    ).rows[0];
    await tx.query(
      "INSERT INTO generation_attempts(job_id,attempt,lease_token,status) VALUES($1,$2,$3,'running')",
      [row.id, attempt, leaseToken]
    );
    return {
      jobId: updated.id,
      userId: updated.user_id,
      attempt,
      leaseToken,
      leaseExpiresAt: iso(updated.lease_expires_at as Date | string),
      request: updated.request,
      mediaType: updated.media_type === "video" ? "video" : "image",
      generationMode: updated.generation_mode ?? "text_to_image",
      durationSeconds:
        updated.duration_seconds === null || updated.duration_seconds === undefined
          ? null
          : Number(updated.duration_seconds),
    };
  });
}

function assertFinite(num: number, label: string): void {
  if (!Number.isInteger(num) || num <= 0) {
    throw new AppError("VALIDATION_ERROR", `${label} must be a positive integer`);
  }
}

/**
 * Extends a running video job's lease before a long provider call. Static
 * jobs keep the short lease; video work is expected to take minutes. Returns
 * false when the lease was lost (the worker must not continue as owner).
 */
export async function extendJobLease(
  db: Database,
  input: { jobId: string; leaseToken: string; leaseSeconds: number }
): Promise<boolean> {
  if (
    !Number.isFinite(input.leaseSeconds) ||
    input.leaseSeconds <= 0 ||
    input.leaseSeconds > 3600
  ) {
    throw new AppError("VALIDATION_ERROR", "invalid lease extension");
  }
  const rows = (
    await db.query<{ id: string }>(
      `UPDATE generation_jobs
       SET lease_expires_at=now()+($3::text)::interval,updated_at=now()
       WHERE id=$1 AND lease_token=$2 AND status='running'
       RETURNING id`,
      [input.jobId, input.leaseToken, `${input.leaseSeconds} seconds`]
    )
  ).rows;
  return rows.length === 1;
}

/**
 * Records the generated asset, captures the held credits and closes the
 * job as succeeded. Fenced (CONFLICT) when the lease token no longer
 * matches, the lease expired, or the job already settled.
 */
export async function completeJob(
  db: Database,
  input: {
    jobId: string;
    leaseToken: string;
    userId: string;
    storageKey: string;
    mime: string;
    sizeBytes: number;
    /** Mock providers must not charge Credits for placeholder output. */
    mock?: boolean;
    /** Present for video jobs. */
    mediaType?: "image" | "video";
    posterStorageKey?: string | null;
    posterMime?: string | null;
    width?: number | null;
    height?: number | null;
    durationSeconds?: number | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  assertFinite(input.sizeBytes, "sizeBytes");
  const mediaType = input.mediaType ?? "image";
  const duration =
    input.durationSeconds === undefined ? null : input.durationSeconds;
  if (duration !== null && ![3, 4, 5].includes(duration)) {
    throw new AppError("VALIDATION_ERROR", "invalid video duration");
  }
  await db.transaction(async (tx) => {
    const job = (
      await tx.query<JobRow>(
        "SELECT * FROM generation_jobs WHERE id=$1 FOR UPDATE",
        [input.jobId]
      )
    ).rows[0];
    if (
      !job ||
      job.user_id !== input.userId ||
      job.lease_token !== input.leaseToken
    ) {
      throw new AppError("CONFLICT", "job lease fenced or unknown");
    }
    if (job.status !== "running") {
      throw new AppError("CONFLICT", `job is not running (status=${job.status})`);
    }
    if (
      job.lease_expires_at !== null &&
      new Date(iso(job.lease_expires_at)).getTime() <= Date.now()
    ) {
      throw new AppError("CONFLICT", "job lease fenced or unknown");
    }
    const cost = Number(job.cost_micros);
    await tx.query(
      `INSERT INTO image_assets(
         id,job_id,user_id,storage_key,mime,size_bytes,
         media_type,duration_seconds,width,height,poster_storage_key,poster_mime,metadata,
         completed_at,expires_at,retention_policy,storage_status
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,
              now(),now()+interval '30 days','temporary_30d','active')`,
      [
        randomUUID(),
        input.jobId,
        input.userId,
        input.storageKey,
        input.mime,
        input.sizeBytes,
        mediaType,
        duration,
        input.width ?? null,
        input.height ?? null,
        input.posterStorageKey ?? null,
        input.posterMime ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    if (input.mock) {
      // Development mock: valid placeholder output, no Credit charge.
      await release(tx, job.user_id, job.id, "generation.mock");
      await tx.query(
        `UPDATE generation_budgets SET reserved=GREATEST(reserved-$2,0)
         WHERE day=CURRENT_DATE AND scope='user' AND scope_id=$1`,
        [job.user_id, cost]
      );
    } else {
      await capture(tx, job.user_id, job.id);
      await tx.query(
        `UPDATE generation_budgets SET reserved=GREATEST(reserved-$2,0),spent=spent+$2
         WHERE day=CURRENT_DATE AND scope='user' AND scope_id=$1`,
        [job.user_id, cost]
      );
    }
    await tx.query(
      `UPDATE generation_jobs
       SET status='succeeded',
           request = request - 'refImage' - '_sourceImageDataUri',
           updated_at=now()
       WHERE id=$1`,
      [job.id]
    );
    await tx.query(
      `UPDATE generation_attempts SET status='succeeded',finished_at=now()
       WHERE job_id=$1 AND lease_token=$2`,
      [job.id, input.leaseToken]
    );
  });
}

/**
 * Marks the job failed and releases the held credits. `providerBilled`
 * retains the cost bound as spent (possible provider billing) instead of
 * just un-reserving it — conservative per DECISIONS.md.
 */
export async function failJob(
  db: Database,
  input: {
    jobId: string;
    leaseToken: string;
    errorCode: string;
    providerBilled?: boolean;
  }
): Promise<void> {
  await db.transaction(async (tx) => {
    const job = (
      await tx.query<JobRow>(
        "SELECT * FROM generation_jobs WHERE id=$1 FOR UPDATE",
        [input.jobId]
      )
    ).rows[0];
    if (
      !job ||
      job.lease_token !== input.leaseToken ||
      job.status !== "running"
    ) {
      throw new AppError("CONFLICT", "job lease fenced or not running");
    }
    if (
      job.lease_expires_at !== null &&
      new Date(iso(job.lease_expires_at)).getTime() <= Date.now()
    ) {
      throw new AppError("CONFLICT", "job lease fenced or not running");
    }
    const cost = Number(job.cost_micros);
    if (input.providerBilled) {
      await tx.query(
        `UPDATE generation_budgets SET reserved=GREATEST(reserved-$2,0),spent=spent+$2
         WHERE day=CURRENT_DATE AND scope='user' AND scope_id=$1`,
        [job.user_id, cost]
      );
    } else {
      await tx.query(
        `UPDATE generation_budgets SET reserved=GREATEST(reserved-$2,0)
         WHERE day=CURRENT_DATE AND scope='user' AND scope_id=$1`,
        [job.user_id, cost]
      );
    }
    await release(tx, job.user_id, job.id);
    await tx.query(
      "UPDATE generation_jobs SET status='failed',request=request - 'refImage' - '_sourceImageDataUri',error_code=$2,updated_at=now() WHERE id=$1",
      [job.id, input.errorCode]
    );
    await tx.query(
      `UPDATE generation_attempts SET status='failed',finished_at=now()
       WHERE job_id=$1 AND lease_token=$2`,
      [job.id, input.leaseToken]
    );
  });
}

/** Owner-scoped job view with its asset; hides soft-deleted jobs. */
export async function getJob(
  db: Database,
  userId: string,
  jobId: string
): Promise<
  | (JobRecord & {
      request: unknown;
      errorCode: string | null;
      deletedAt: string | null;
      asset: {
        storageKey: string;
        mime: string;
        sizeBytes: number;
        mediaType: "image" | "video";
        durationSeconds: number | null;
        width: number | null;
        height: number | null;
        posterStorageKey: string | null;
        posterMime: string | null;
        metadata: Record<string, unknown> | null;
        completedAt: string | null;
        expiresAt: string | null;
        retentionPolicy: "legacy" | "temporary_30d";
        storageStatus: "active" | "deleting" | "deleted" | "delete_failed";
        deleteAttempts: number;
      } | null;
    })
  | null
> {
  const row = (
    await db.query<
      JobRow & {
        deleted_at: Date | string | null;
        storage_key: string | null;
        mime: string | null;
        size_bytes: number | string | null;
        asset_media_type: string | null;
        asset_duration_seconds: number | string | null;
        asset_width: number | string | null;
        asset_height: number | string | null;
        poster_storage_key: string | null;
        poster_mime: string | null;
        asset_metadata: unknown;
        completed_at: Date | string | null;
        expires_at: Date | string | null;
        retention_policy: string | null;
        storage_status: string | null;
        delete_attempts: number | string | null;
      }
    >(
      `SELECT j.*,a.storage_key,a.mime,a.size_bytes,
              a.media_type AS asset_media_type,a.duration_seconds AS asset_duration_seconds,
              a.width AS asset_width,a.height AS asset_height,
              a.poster_storage_key,a.poster_mime,a.metadata AS asset_metadata,
              a.completed_at,a.expires_at,a.retention_policy,a.storage_status,a.delete_attempts
       FROM generation_jobs j LEFT JOIN image_assets a ON a.job_id=j.id
       WHERE j.id=$1 AND j.user_id=$2`,
      [jobId, userId]
    )
  ).rows[0];
  if (!row) return null;
  return {
    ...toRecord(row),
    request: row.request,
    errorCode: row.error_code,
    deletedAt: row.deleted_at ? iso(row.deleted_at) : null,
    asset: row.storage_key
      ? {
          storageKey: row.storage_key,
          mime: row.mime as string,
          sizeBytes: Number(row.size_bytes),
          mediaType: row.asset_media_type === "video" ? "video" : "image",
          durationSeconds:
            row.asset_duration_seconds === null ||
            row.asset_duration_seconds === undefined
              ? null
              : Number(row.asset_duration_seconds),
          width:
            row.asset_width === null || row.asset_width === undefined
              ? null
              : Number(row.asset_width),
          height:
            row.asset_height === null || row.asset_height === undefined
              ? null
              : Number(row.asset_height),
          posterStorageKey: row.poster_storage_key ?? null,
          posterMime: row.poster_mime ?? null,
          metadata:
            row.asset_metadata && typeof row.asset_metadata === "object"
              ? (row.asset_metadata as Record<string, unknown>)
              : null,
          completedAt: row.completed_at ? iso(row.completed_at) : null,
          expiresAt: row.expires_at ? iso(row.expires_at) : null,
          retentionPolicy:
            row.retention_policy === "temporary_30d" ? "temporary_30d" : "legacy",
          storageStatus:
            row.storage_status === "deleting" ||
            row.storage_status === "deleted" ||
            row.storage_status === "delete_failed"
              ? row.storage_status
              : "active",
          deleteAttempts:
            row.delete_attempts === null || row.delete_attempts === undefined
              ? 0
              : Number(row.delete_attempts),
        }
      : null,
  };
}
