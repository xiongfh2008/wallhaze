/**
 * Maps a generation failure to its i18n message key (FE04-A).
 *
 * Branching happens on the stable pieces of a failure — the typed
 * GenerateOutcome reason and the backend's ApiErrorCode — never on English
 * message text, so copy can be translated freely without breaking logic.
 * Pure and unit-testable; the component layer only renders the result.
 */

import type { ApiErrorCode } from "@wallhaze/contracts";
import type { GenerateOutcome } from "@/lib/api/generation";

export interface GenerationErrorCopy {
  /** Key inside the `generator` messages namespace. */
  key: string;
  /** ICU values for the message (e.g. the server's Retry-After seconds). */
  values?: Record<string, string | number>;
}

/** Codes with dedicated copy; everything else falls back to the generic. */
const CODE_COPY: Partial<Record<ApiErrorCode, string>> = {
  VALIDATION_ERROR: "errorValidation",
  UNAUTHENTICATED: "errorUnauthenticated",
  FORBIDDEN: "errorForbidden",
  RATE_LIMITED: "errorRateLimited",
  CONTENT_FILTERED: "errorContentFiltered",
  PAYLOAD_TOO_LARGE: "errorPayloadTooLarge",
  UNSUPPORTED_MEDIA_TYPE: "errorUnsupportedMedia",
  UPSTREAM_ERROR: "errorUpstream",
  SERVICE_UNAVAILABLE: "errorServiceUnavailable",
  // NOT_FOUND / CONFLICT / NOT_IMPLEMENTED / INTERNAL_ERROR / unknown → generic.
};

/**
 * Resolves the user-facing error copy for a failed GenerateOutcome. The
 * server's Retry-After is passed through verbatim when present — a real
 * value is displayed, never an invented backoff.
 */
export function generationErrorCopy(
  outcome: Extract<GenerateOutcome, { ok: false }>
): GenerationErrorCopy {
  switch (outcome.reason) {
    case "unavailable":
      return { key: "apiUnavailable" };
    case "network":
      return { key: "networkError" };
    case "timeout":
      return { key: "statusTimedOut" };
    case "canceled":
      return { key: "statusCanceled" };
    case "invalid":
      return { key: "invalidResponse" };
    case "http": {
      const code = outcome.code;
      const key =
        (code && CODE_COPY[code]) || "errorGenericHttp";
      const values =
        code === "RATE_LIMITED" &&
        typeof outcome.retryAfterSeconds === "number"
          ? { seconds: outcome.retryAfterSeconds }
          : undefined;
      return { key, values };
    }
  }
}
