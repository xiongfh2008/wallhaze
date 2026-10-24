import type { Database } from "../db/database.js";
import type { PrivateStorage } from "./storage.js";
import { claimJob, completeJob, extendJobLease, failJob, type ClaimedJob } from "./jobs.js";
import { validateGenerateBody } from "../modules/generation/generation.validators.js";
import type { ValidatedGeneration } from "../modules/generation/generation.validators.js";
import { validateVideoBody } from "../modules/generation/video.validators.js";
import type { ValidatedVideoGeneration } from "../modules/generation/video.validators.js";
import type { JobProvider } from "./providers.js";
import type { VideoJobProvider } from "../modules/generation/video.providers.js";
import { VideoProviderError } from "../modules/generation/video.providers.js";
import {
  PROMPT_BUILDER_VERSION,
  VIDEO_PROMPT_BUILDER_VERSION,
} from "../catalog/prompt-builder.js";
import type { GenerationMode } from "./provider-mode.js";

/**
 * Generation worker loop (R05). Owns no state: it claims leases through
 * jobs.claimJob, executes the selected image/video provider with a hard
 * timeout, persists the media through the storage adapter and settles the
 * job. All failure paths release the user's credits; calls that may have
 * been billed (timeouts, storage failures after the provider returned) retain
 * the cost bound as spent. A fenced completion (lease lost) is never retried
 * here — the owning worker won the job.
 */

/** Hard per-attempt image provider budget. */
const PROVIDER_TIMEOUT_MS = 120_000;
/** Video queue calls can legitimately take minutes (3–5s output, 720p). */
export const VIDEO_PROVIDER_TIMEOUT_MS = 8 * 60 * 1000;
/** Long video lease; extended immediately after a video job is claimed. */
export const VIDEO_LEASE_SECONDS = 900;

export interface WorkerDeps {
  provider: JobProvider;
  /** Video adapters selected by the runtime; absent => video jobs fail closed. */
  videoProviders?: {
    imageToVideo: VideoJobProvider;
    textToVideo: VideoJobProvider;
  };
  storage: PrivateStorage;
  leaseSeconds?: number;
  timeoutMs?: number;
  /** Active runtime mode for video capability validation. */
  generationMode?: GenerationMode;
  /** Mock mode: valid placeholder output, no Credit charge. */
  mock?: boolean;
  /** Operator pause: claim nothing; no provider call can start. */
  paused?: boolean;
  /**
   * Structured job diagnostics. Never receives prompts, reference images,
   * credentials or tokens — only ids, phases, sizes and error classes.
   */
  log?: (event: Record<string, unknown>) => void;
}

export class FencedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FencedError";
  }
}

export function isFenced(error: unknown): boolean {
  return error instanceof FencedError;
}

/** Re-validates a stored request and runs the provider against it. */
export async function runGenerationRequest(
  request: unknown,
  provider: JobProvider,
  timeoutMs = PROVIDER_TIMEOUT_MS
): Promise<{ bytes: Buffer; mime: string }> {
  const validation = validateGenerateBody(request);
  if (!validation.ok) {
    throw new Error("STORED_REQUEST_INVALID");
  }
  const validated: ValidatedGeneration = validation.value;
  // Prefer the prompt composed and persisted at enqueue time. Style templates
  // may change; a queued job must keep the exact prompt it was priced for.
  const stored = (request as { _composed?: { builderVersion?: unknown; prompt?: unknown } })
    ._composed;
  const finalPrompt =
    stored &&
    stored.builderVersion === PROMPT_BUILDER_VERSION &&
    typeof stored.prompt === "string" &&
    stored.prompt.length > 0
      ? stored.prompt
      : validated.finalPrompt;
  return provider.generate(
    { ...validated, finalPrompt },
    AbortSignal.timeout(timeoutMs)
  );
}

/**
 * Re-validates a stored video request with the runtime capability matrix and
 * calls the selected video adapter. The stored composed prompt/version wins,
 * so editing a style later cannot change a queued job.
 */
export async function runVideoGenerationRequest(
  request: unknown,
  provider: VideoJobProvider,
  runtime: GenerationMode,
  timeoutMs = VIDEO_PROVIDER_TIMEOUT_MS
) {
  const validation = validateVideoBody(request, runtime);
  if (!validation.ok) {
    throw new Error("STORED_REQUEST_INVALID");
  }
  const validated: ValidatedVideoGeneration = validation.value;
  const stored = (
    request as {
      _composed?: { builderVersion?: unknown; prompt?: unknown };
    }
  )._composed;
  const finalPrompt =
    stored &&
    stored.builderVersion === VIDEO_PROMPT_BUILDER_VERSION &&
    typeof stored.prompt === "string" &&
    stored.prompt.length > 0
      ? stored.prompt
      : validated.finalPrompt;
  return provider.generate(
    {
      generationMode: validated.generationMode,
      durationSeconds: validated.durationSeconds,
      aspectRatio: validated.aspectRatio,
      finalPrompt,
      motionPrompt: validated.motionPrompt,
      negativePrompt: validated.negativePrompt,
      sourceImageDataUri: validated.sourceImageDataUri,
      width: null,
      height: null,
    },
    AbortSignal.timeout(timeoutMs)
  );
}

async function settleFailure(
  db: Database,
  claim: ClaimedJob,
  errorCode: string,
  providerBilled: boolean
): Promise<void> {
  try {
    await failJob(db, {
      jobId: claim.jobId,
      leaseToken: claim.leaseToken,
      errorCode,
      providerBilled,
    });
  } catch (error) {
    if (isFenced(error)) return;
    throw error;
  }
}

async function executeVideoJob(
  db: Database,
  deps: WorkerDeps,
  claim: ClaimedJob
): Promise<true> {
  if (!deps.videoProviders) {
    await settleFailure(db, claim, "VIDEO_PROVIDER_UNAVAILABLE", false);
    return true;
  }
  const extended = await extendJobLease(db, {
    jobId: claim.jobId,
    leaseToken: claim.leaseToken,
    leaseSeconds: VIDEO_LEASE_SECONDS,
  });
  if (!extended) {
    throw new FencedError("video lease extension fenced");
  }
  const provider =
    claim.generationMode === "text_to_video"
      ? deps.videoProviders.textToVideo
      : deps.videoProviders.imageToVideo;

  let output: Awaited<ReturnType<typeof runVideoGenerationRequest>>;
  try {
    output = await runVideoGenerationRequest(
      claim.request,
      provider,
      deps.generationMode ?? "mock"
    );
  } catch (error) {
    const isTimeout =
      (error instanceof VideoProviderError && error.failure === "timeout") ||
      (error instanceof Error && error.name === "TimeoutError");
    const storedInvalid =
      error instanceof Error && error.message === "STORED_REQUEST_INVALID";
    const errorCode = isTimeout
      ? "UPSTREAM_TIMEOUT"
      : storedInvalid
        ? "STORED_REQUEST_INVALID"
        : "UPSTREAM_ERROR";
    deps.log?.({
      event: "generation.worker",
      phase: "failed",
      jobId: claim.jobId,
      mediaType: "video",
      errorCode,
    });
    await settleFailure(db, claim, errorCode, !storedInvalid);
    return true;
  }

  const posterKey = output.poster ? `${claim.jobId}.poster` : null;
  try {
    await deps.storage.put(claim.jobId, output.video.bytes, output.video.mime);
    if (output.poster && posterKey) {
      await deps.storage.put(
        posterKey,
        output.poster.bytes,
        output.poster.mime
      );
    }
  } catch {
    await deps.storage.delete(claim.jobId).catch(() => undefined);
    if (posterKey) await deps.storage.delete(posterKey).catch(() => undefined);
    deps.log?.({
      event: "generation.worker",
      phase: "failed",
      jobId: claim.jobId,
      mediaType: "video",
      errorCode: "STORAGE_FAILED",
    });
    await settleFailure(db, claim, "STORAGE_FAILED", true);
    return true;
  }

  try {
    await completeJob(db, {
      jobId: claim.jobId,
      leaseToken: claim.leaseToken,
      userId: claim.userId,
      storageKey: claim.jobId,
      mime: output.video.mime,
      sizeBytes: output.video.bytes.length,
      mock: deps.mock,
      mediaType: "video",
      posterStorageKey: posterKey,
      posterMime: output.poster?.mime ?? null,
      width: output.width,
      height: output.height,
      durationSeconds: output.durationSeconds,
      metadata: output.metadata,
    });
  } catch (error) {
    if (error instanceof Error && /fenced|not running/i.test(error.message)) {
      throw new FencedError(error.message);
    }
    throw error;
  }
  deps.log?.({
    event: "generation.worker",
    phase: "succeeded",
    jobId: claim.jobId,
    mediaType: "video",
    mock: Boolean(deps.mock),
    bytes: output.video.bytes.length,
    mime: output.video.mime,
  });
  return true;
}

/**
 * Claims and executes at most one job. Returns true when a job was
 * processed (success or failure), false when nothing was claimable.
 */
export async function runWorkerOnce(
  db: Database,
  deps: WorkerDeps,
  workerId: string
): Promise<boolean> {
  if (deps.paused) return false;
  const claim = await claimJob(db, {
    workerId,
    leaseSeconds: deps.leaseSeconds ?? 300,
  });
  if (!claim) return false;
  deps.log?.({
    event: "generation.worker",
    phase: "claimed",
    jobId: claim.jobId,
    attempt: claim.attempt,
  });

  // LIVE retries are unsafe: the previous attempt may already have reached
  // fal.ai and been billed. A re-claimed lease therefore fails without a
  // second provider call (credits released, possible cost retained). Mock
  // retries are free and keep their re-run behavior for tests.
  if (!deps.mock && claim.attempt > 1) {
    deps.log?.({
      event: "generation.worker",
      phase: "failed",
      jobId: claim.jobId,
      errorCode: "UPSTREAM_UNCERTAIN",
    });
    await settleFailure(db, claim, "UPSTREAM_UNCERTAIN", true);
    return true;
  }

  if (claim.mediaType === "video") {
    return executeVideoJob(db, deps, claim);
  }

  let stored: { bytes: Buffer; mime: string };
  try {
    stored = await runGenerationRequest(
      claim.request,
      deps.provider,
      deps.timeoutMs ?? PROVIDER_TIMEOUT_MS
    );
  } catch (error) {
    const aborted = error instanceof Error && error.name === "TimeoutError";
    const errorCode = aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR";
    deps.log?.({
      event: "generation.worker",
      phase: "failed",
      jobId: claim.jobId,
      errorCode,
    });
    await settleFailure(
      db,
      claim,
      errorCode,
      aborted // conservative: a timed-out call may still have been billed
    );
    return true;
  }

  // Storage failure: the provider may have billed us, but the user must
  // not be charged — release credits, retain the cost bound as spent.
  try {
    await deps.storage.put(claim.jobId, stored.bytes, stored.mime);
  } catch {
    deps.log?.({
      event: "generation.worker",
      phase: "failed",
      jobId: claim.jobId,
      errorCode: "STORAGE_FAILED",
    });
    await settleFailure(db, claim, "STORAGE_FAILED", true);
    return true;
  }

  try {
    await completeJob(db, {
      jobId: claim.jobId,
      leaseToken: claim.leaseToken,
      userId: claim.userId,
      storageKey: claim.jobId,
      mime: stored.mime,
      sizeBytes: stored.bytes.length,
      mock: deps.mock,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /fenced|not running/i.test(error.message)
    ) {
      throw new FencedError(error.message);
    }
    throw error;
  }
  deps.log?.({
    event: "generation.worker",
    phase: "succeeded",
    jobId: claim.jobId,
    mock: Boolean(deps.mock),
    bytes: stored.bytes.length,
    mime: stored.mime,
  });
  return true;
}

/**
 * Polling worker. Returns a stop handle; the current tick finishes before
 * stopping, and stop() resolves once the loop has fully drained.
 */
export function startWorker(
  db: Database,
  deps: WorkerDeps,
  workerId: string,
  pollIntervalMs = 2_000
): { stop(): Promise<void> } {
  let stopped = false;
  let running: Promise<void> = Promise.resolve();
  const tick = async (): Promise<void> => {
    try {
      await runWorkerOnce(db, deps, workerId);
    } catch (error) {
      // Fenced = another worker owns the job now; anything else is logged
      // and retried on the next tick — the loop must survive.

      if (!isFenced(error)) {
        console.error(
          `[worker:${workerId}] tick failed:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  };
  const loop = async (): Promise<void> => {
    while (!stopped) {
      running = tick();
      await running;
      if (stopped) break;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  };
  const drained = loop();
  return {
    stop: async (): Promise<void> => {
      stopped = true;
      await drained;
    },
  };
}
