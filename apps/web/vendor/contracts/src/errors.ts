/**
 * Unified API error envelope (T04-S1).
 *
 * Every non-2xx response from apps/api uses this shape. The legacy
 * `/api/generate` route in the monolith answered with a flat
 * `{ error: string }` — that shape is NOT part of the new contract; the
 * standalone API always returns the structured envelope below.
 */

export const API_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "RATE_LIMITED",
  "CONTENT_FILTERED",
  "INTERNAL_ERROR",
  "NOT_IMPLEMENTED",
  "UPSTREAM_ERROR",
  "SERVICE_UNAVAILABLE",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorEnvelope {
  error: {
    /** Stable machine-readable code — clients must branch on this. */
    code: ApiErrorCode;
    /** Human-readable, English-first message. */
    message: string;
    /** Optional structured details (e.g. zod issues). */
    details?: unknown;
  };
}
