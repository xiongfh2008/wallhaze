/**
 * Async job executor for the Studio (R05/R07 integration).
 *
 * Implements the flow's GenerationExecutor contract on top of the async job
 * API: POST creates the job (credits reserved server-side), then GET polls
 * until the worker settles it. No credits are touched here — the backend
 * owns reservation, capture and release.
 *
 * Every failure maps onto the existing GenerateOutcome union, so the Studio
 * state machine and its copy stay unchanged.
 */

import type { GenerationRequest } from "@wallhaze/contracts";
import {
  createGenerationJob,
  getGenerationJob,
  type GenerationJobStatus,
} from "@/lib/api/jobs";
import { resolveApiUrl } from "@/lib/api/client";
import type { GenerateOutcome } from "@/lib/api/generation";

/** Poll cadence and hard ceiling for one async generation. */
export const JOB_POLL_INTERVAL_MS = 1_500;
export const JOB_POLL_TIMEOUT_MS = 5 * 60 * 1000;

const TERMINAL: ReadonlySet<string> = new Set(["succeeded", "failed"]);

export interface AsyncExecutorOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  createIdempotencyKey?: () => string;
}

function failure(
  reason: Extract<GenerateOutcome, { ok: false }>["reason"],
  message: string | null = null,
  code?: Extract<GenerateOutcome, { ok: false }>["code"]
): GenerateOutcome {
  return { ok: false, reason, message, ...(code !== undefined ? { code } : {}) };
}

function succeeded(status: GenerationJobStatus): GenerateOutcome | null {
  if (status.status !== "succeeded" || !status.imageUrl) return null;
  // The backend returns an API-relative signed image path; the browser
  // loads it from the API origin (the signature authorizes the request).
  const imageUrl = resolveApiUrl(status.imageUrl);
  if (!imageUrl) return null;
  return {
    ok: true,
    imageUrl,
    width: null,
    height: null,
    contentType: "image/png",
    mock: status.mock,
  };
}

function settle(status: GenerationJobStatus): GenerateOutcome | null {
  if (!TERMINAL.has(status.status)) return null;
  const success = succeeded(status);
  if (success) return success;
  // Failed jobs surface their stable error code; the UI never invents copy
  // beyond the generic failure state.
  return failure("http", null, (status.errorCode as never) ?? null);
}

/**
 * Builds the executor the Studio passes to createGenerationFlow. The signal
 * aborts both the initial request and the polling loop.
 */
export function createAsyncJobExecutor(
  options: AsyncExecutorOptions = {}
): (input: GenerationRequest, opts: { signal: AbortSignal }) => Promise<GenerateOutcome> {
  const pollIntervalMs = options.pollIntervalMs ?? JOB_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? JOB_POLL_TIMEOUT_MS;
  const newKey = options.createIdempotencyKey ?? (() => crypto.randomUUID());

  return async (input, { signal }): Promise<GenerateOutcome> => {
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

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (signal.aborted) return failure("canceled");
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      if (signal.aborted) return failure("canceled");
      const status = await getGenerationJob(created.data.jobId, { signal });
      if (!status.ok) {
        if (status.failure.kind === "canceled") return failure("canceled");
        // A transient poll failure is not fatal — the next tick may succeed.
        if (status.failure.kind === "network") continue;
        if (status.failure.kind === "http") {
          return failure("http", status.failure.message, status.failure.code);
        }
        return failure("network");
      }
      const settled = settle(status.data);
      if (settled) return settled;
    }
    // The job may still finish server-side; the client just stops waiting.
    return failure("timeout");
  };
}
