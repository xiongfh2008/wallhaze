/**
 * Stable mapping from a generation failure to shipped copy.
 *
 * The async job API returns either an API error code or a worker error code
 * (UPSTREAM_ERROR / UPSTREAM_TIMEOUT / STORAGE_FAILED). The UI must not
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
    default:
      return reason === "timeout" ? "errorTimeout" : "generateFailed";
  }
}
