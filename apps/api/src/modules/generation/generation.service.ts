import type { ApiErrorCode, GenerationResponse } from "@wallhaze/contracts";
import { AppError } from "../../errors/app-error.js";
import {
  checkDailyQuota,
  checkGlobalDailyBudget,
  releaseConcurrencySlot,
  tryAcquireConcurrencySlot,
} from "../../security/rate-limit.js";
import { FAL_EDIT_ENDPOINT, FAL_ENDPOINT } from "./fal.endpoints.js";
import type { FalProvider, UpstreamError } from "./fal.provider.js";
import type { ValidatedGeneration } from "./generation.validators.js";

/**
 * Generation orchestration (T04-S2 migration of the legacy
 * `app/api/generate/route.ts` stage 4.4-A quota/concurrency/upstream block).
 *
 * Runs AFTER all validation (the route validates first): nothing that could
 * cost money is ever reached by a rejected request. All checks are
 * "submission" semantics — counted even when the upstream call later fails
 * (a failed call may already have cost money; conservative and simple).
 *
 * Every failure is thrown as an {@link GenerationOutcomeError} carrying the
 * legacy client-facing copy VERBATIM plus the legacy structured-log outcome,
 * so both the HTTP behavior and the log vocabulary of the old route carry
 * over unchanged.
 */

/** Legacy client-facing copies for generation failures (verbatim). */
export const GENERATION_MESSAGES = {
  dailyQuota:
    "You've reached today's generation limit. Please try again tomorrow.",
  dailyBudget:
    "The image service has reached today's request limit. Please try again tomorrow.",
  concurrency:
    "The image service is busy right now. Please try again in a moment.",
  unreachable: "Could not reach the image service. Please try again.",
  upstreamBusy:
    "The image service is busy right now. Please try again in a moment",
  upstreamFailed: "Image generation failed. Please try again.",
  invalidResponse:
    "The image service returned an invalid response. Please try again.",
  noImage: "The image service returned no image. Please try again.",
  nsfw:
    "Your prompt was flagged by the safety checker. Please adjust it and try again.",
} as const;

/**
 * An AppError that additionally carries the legacy structured-log outcome
 * string (`rejected:daily-quota`, `upstream:timeout`, …). The outcome is
 * LOG-ONLY — the error handler never puts it in the response envelope.
 */
export class GenerationOutcomeError extends AppError {
  readonly logOutcome: string;

  constructor(
    code: ApiErrorCode,
    message: string,
    logOutcome: string,
    options: { retryAfterSeconds?: number } = {}
  ) {
    super(code, message, options);
    this.logOutcome = logOutcome;
  }
}

export interface GenerationServiceInput {
  /** Limiter bucket key (see security/request-guard.ts getClientKey). */
  clientKey: string;
  /** Fully validated + composed upstream inputs (see generation.validators). */
  validated: ValidatedGeneration;
  /** Aborts when the client disconnects (see the route's socket wiring). */
  clientSignal: AbortSignal;
}

export interface GenerationService {
  /** Runs one wallpaper generation. Throws GenerationOutcomeError/AppError. */
  generate(input: GenerationServiceInput): Promise<GenerationResponse>;
}

export interface GenerationServiceOptions {
  /** The ONLY outbound boundary. The route 503s before calling when absent. */
  provider: FalProvider;
}

/** Maps a provider failure to the exact legacy status/message/log outcome. */
function mapUpstreamError(error: unknown): GenerationOutcomeError {
  const failure = (error as UpstreamError | null)?.failure;
  switch (failure) {
    case "client-aborted":
      // The response goes nowhere (the client is gone), but the code path,
      // status and log line stay identical to the legacy route.
      return new GenerationOutcomeError(
        "UPSTREAM_ERROR",
        GENERATION_MESSAGES.unreachable,
        "upstream:client-aborted"
      );
    case "timeout":
      return new GenerationOutcomeError(
        "UPSTREAM_ERROR",
        GENERATION_MESSAGES.unreachable,
        "upstream:timeout"
      );
    case "failed":
      return new GenerationOutcomeError(
        "UPSTREAM_ERROR",
        GENERATION_MESSAGES.unreachable,
        "upstream:failed"
      );
    case "status":
      return new GenerationOutcomeError(
        "UPSTREAM_ERROR",
        (error as UpstreamError).upstreamStatus === 429
          ? GENERATION_MESSAGES.upstreamBusy
          : GENERATION_MESSAGES.upstreamFailed,
        "upstream:error"
      );
    case "invalid-response":
      return new GenerationOutcomeError(
        "UPSTREAM_ERROR",
        GENERATION_MESSAGES.invalidResponse,
        "upstream:invalid-response"
      );
    case "no-image":
      return new GenerationOutcomeError(
        "UPSTREAM_ERROR",
        GENERATION_MESSAGES.noImage,
        "upstream:no-image"
      );
    case "nsfw":
      return new GenerationOutcomeError(
        "CONTENT_FILTERED",
        GENERATION_MESSAGES.nsfw,
        "upstream:nsfw-flagged"
      );
    default:
      // Defensive catch-all — the provider contract says UpstreamError only.
      return new GenerationOutcomeError(
        "UPSTREAM_ERROR",
        GENERATION_MESSAGES.unreachable,
        "upstream:failed"
      );
  }
}

export function createGenerationService(
  options: GenerationServiceOptions
): GenerationService {
  return {
    async generate(input: GenerationServiceInput): Promise<GenerationResponse> {
      // 1) Per-client daily quota (UTC day). With the shared bucket this is
      //    effectively a global daily cap until TRUST_PROXY exists.
      const dailyQuota = checkDailyQuota(input.clientKey);
      if (!dailyQuota.allowed) {
        throw new GenerationOutcomeError(
          "RATE_LIMITED",
          GENERATION_MESSAGES.dailyQuota,
          "rejected:daily-quota",
          { retryAfterSeconds: dailyQuota.retryAfterSeconds }
        );
      }

      // 2) Global daily request budget — a REQUEST-COUNT circuit breaker,
      //    not a real-cost budget (actual fal.ai spending is not measured).
      const globalBudget = checkGlobalDailyBudget();
      if (!globalBudget.allowed) {
        throw new GenerationOutcomeError(
          "SERVICE_UNAVAILABLE",
          GENERATION_MESSAGES.dailyBudget,
          "rejected:daily-budget",
          { retryAfterSeconds: globalBudget.retryAfterSeconds }
        );
      }

      // 3) Concurrency slot — acquired last, released in the finally below.
      //    The slot is held for the whole upstream interaction and every exit
      //    path — success, provider error, timeout, client disconnect — frees
      //    it. Aborting the local request does NOT cancel a started fal.ai
      //    task or waive its cost.
      if (!tryAcquireConcurrencySlot()) {
        throw new GenerationOutcomeError(
          "RATE_LIMITED",
          GENERATION_MESSAGES.concurrency,
          "rejected:concurrency"
        );
      }

      // Reference image → official image-to-image endpoint; otherwise
      // text-to-image. Payload shape mirrors the legacy route exactly.
      const payload: Record<string, unknown> = {
        prompt: input.validated.finalPrompt,
        image_size: input.validated.imageSize,
        num_images: 1,
        enable_safety_checker: true,
        output_format: "png",
      };
      if (input.validated.refDataUri) {
        payload.image_urls = [input.validated.refDataUri];
      }

      try {
        return await options.provider.generate({
          endpoint: input.validated.refDataUri
            ? FAL_EDIT_ENDPOINT
            : FAL_ENDPOINT,
          payload,
          signal: input.clientSignal,
        });
      } catch (error) {
        throw mapUpstreamError(error);
      } finally {
        releaseConcurrencySlot();
      }
    },
  };
}
