import type { ApiErrorCode, ApiErrorEnvelope } from "@wallhaze/contracts";

/** Default HTTP status per stable error code. */
export const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  CONTENT_FILTERED: 422,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  UPSTREAM_ERROR: 502,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * The only error type business code is allowed to throw across the wire.
 * Everything else is flattened into an INTERNAL_ERROR envelope by the
 * global error handler so internals never leak to clients.
 *
 * `retryAfterSeconds`, when set, is surfaced as a Retry-After header (rate
 * limiting / budget responses — mirrors the legacy route's behavior).
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: {
      details?: unknown;
      statusCode?: number;
      retryAfterSeconds?: number;
    } = {}
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = options.statusCode ?? STATUS_BY_CODE[code];
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** Builds the unified error envelope (see packages/contracts/src/errors.ts). */
export function errorEnvelope(
  code: ApiErrorCode,
  message: string,
  details?: unknown
): ApiErrorEnvelope {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}
