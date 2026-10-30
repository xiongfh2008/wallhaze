/**
 * Stable mapping from a generation failure to shipped copy.
 *
 * The async job API returns either an API error code or a worker error code
 * (UPSTREAM_ERROR / UPSTREAM_TIMEOUT / STORAGE_FAILED) and the moderation
 * chain (MODERATION_* pre-generation, OUTPUT_MODERATION_* post-generation).
 * The UI must not
 * collapse all of them into "generation failed" — storage and provider
 * failures have different meanings and different user actions.
 */

export type GenerationErrorKey =
  | "errorStorageFailed"
  | "errorTimeout"
  | "errorUpstream"
  | "errorRateLimited"
  | "errorInsufficientCredits"
  | "errorServiceUnavailable"
  | "errorUncertain"
  | "errorModerationBlocked"
  | "errorModerationPending"
  | "errorModerationUnavailable"
  | "errorOutputBlocked"
  | "errorOutputUnavailable"
  | "generateFailed";

export function generationErrorKey(
  code: string | null | undefined,
  reason: string
): GenerationErrorKey {
  switch (code) {
    case "STORAGE_FAILED":
      return "errorStorageFailed";
    case "UPSTREAM_TIMEOUT":
      return "errorTimeout";
    case "UPSTREAM_ERROR":
      return "errorUpstream";
    case "RATE_LIMITED":
      return "errorRateLimited";
    case "CONFLICT":
      return "errorInsufficientCredits";
    case "SERVICE_UNAVAILABLE":
      return "errorServiceUnavailable";
    case "UPSTREAM_UNCERTAIN":
      return "errorUncertain";
    case "MODERATION_BLOCKED":
      return "errorModerationBlocked";
    case "MODERATION_PENDING":
      return "errorModerationPending";
    case "MODERATION_UNAVAILABLE":
      return "errorModerationUnavailable";
    case "OUTPUT_MODERATION_BLOCKED":
      return "errorOutputBlocked";
    case "OUTPUT_MODERATION_UNAVAILABLE":
      return "errorOutputUnavailable";
    default:
      return reason === "timeout" ? "errorTimeout" : "generateFailed";
  }
}
