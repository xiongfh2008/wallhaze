/**
 * Async video job executor. Mirrors the image executor but returns MP4 /
 * poster / download URLs from the owner-scoped job status. All credits,
 * provider calls and storage authorization remain server-side.
 */

import type { ApiErrorCode, VideoGenerationRequest } from "@wallhaze/contracts";
import {
  createGenerationJob,
  getGenerationJob,
  type GenerationJobStatus,
} from "@/lib/api/jobs";
import { resolveApiUrl } from "@/lib/api/client";
import type { GenerateFailureReason } from "@/lib/api/generation";

export const VIDEO_POLL_INTERVAL_MS = 2_000;
export const VIDEO_POLL_TIMEOUT_MS = 10 * 60 * 1000;

export type VideoGenerateOutcome =
  | {
      ok: true;
      videoUrl: string;
      posterUrl: string | null;
      downloadUrl: string;
      durationSeconds: number | null;
      width: number | null;
      height: number | null;
      mime: string;
      mock: boolean;
      jobId: string;
    }
  | {
      ok: false;
      reason: GenerateFailureReason;
      message: string | null;
      code?: ApiErrorCode | null;
    };

function failure(
  reason: GenerateFailureReason,
  message: string | null = null,
  code?: ApiErrorCode | null
): VideoGenerateOutcome {
  return { ok: false, reason, message, ...(code !== undefined ? { code } : {}) };
}

function settled(status: GenerationJobStatus): VideoGenerateOutcome | null {
  if (status.status === "failed") {
    return failure("http", null, (status.errorCode as ApiErrorCode | null) ?? null);
  }
  if (status.status !== "succeeded") return null;
  if (!status.videoUrl) return failure("invalid");
  const videoUrl = resolveApiUrl(status.videoUrl);
  const posterUrl = status.posterUrl ? resolveApiUrl(status.posterUrl) : null;
  const downloadUrl = status.videoDownloadUrl
    ? resolveApiUrl(status.videoDownloadUrl)
    : videoUrl;
  if (!videoUrl || !downloadUrl) return failure("invalid");
  return {
    ok: true,
    videoUrl,
    posterUrl,
    downloadUrl,
    durationSeconds: status.durationSeconds ?? null,
    width: status.width ?? null,
    height: status.height ?? null,
    mime: status.mime ?? "video/mp4",
    mock: status.mock,
    jobId: status.jobId,
  };
}

export function createVideoJobExecutor(options: {
  pollIntervalMs?: number;
  timeoutMs?: number;
  createIdempotencyKey?: () => string;
} = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? VIDEO_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? VIDEO_POLL_TIMEOUT_MS;
  const newKey = options.createIdempotencyKey ?? (() => crypto.randomUUID());

  return async (
    input: VideoGenerationRequest,
    opts: { signal: AbortSignal }
  ): Promise<VideoGenerateOutcome> => {
    const { signal } = opts;
    if (signal.aborted) return failure("canceled");
    const created = await createGenerationJob(input, newKey(), { signal });
    if (!created.ok) {
      if (created.failure.kind === "unavailable") return failure("unavailable");
      if (created.failure.kind === "canceled") return failure("canceled");
      if (created.failure.kind === "timeout") return failure("timeout");
      if (created.failure.kind === "http") {
        return failure("http", created.failure.message, created.failure.code);
      }
      return failure("network");
    }
    const jobId = created.data.jobId;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (signal.aborted) return failure("canceled");
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      if (signal.aborted) return failure("canceled");
      const status = await getGenerationJob(jobId, { signal });
      if (!status.ok) {
        if (status.failure.kind === "canceled") return failure("canceled");
        if (status.failure.kind === "network") continue;
        if (status.failure.kind === "http") {
          return failure("http", status.failure.message, status.failure.code);
        }
        return failure("network");
      }
      const result = settled(status.data);
      if (result) return result;
    }
    return failure("timeout");
  };
}
