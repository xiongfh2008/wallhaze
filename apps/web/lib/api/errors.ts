/**
 * Unified client-side error model for the standalone API (T04-S2).
 *
 * Every failure the API client can produce is a discriminated {@link ApiFailure}.
 * HTTP failures carry the backend's stable ApiErrorCode from the unified
 * ApiErrorEnvelope (packages/contracts/src/errors.ts) plus the parsed
 * Retry-After header, so callers branch on CODES, never on message text or
 * raw status numbers.
 */

import type { ApiErrorCode, ApiErrorEnvelope } from "@wallhaze/contracts";

/** Why a request did not produce a usable payload. */
export type ApiFailure =
  /** API base URL not configured — nothing was sent at all. */
  | { kind: "unavailable" }
  /** fetch itself failed (offline, DNS, CORS). */
  | { kind: "network" }
  /** The per-request timeout fired before a response arrived. */
  | { kind: "timeout" }
  /** The caller-provided AbortSignal canceled the request. */
  | { kind: "canceled" }
  /** API replied with a non-2xx status; details from the error envelope. */
  | {
      kind: "http";
      status: number;
      code: ApiErrorCode | null;
      message: string | null;
      retryAfterSeconds: number | null;
    }
  /** 2xx but the body does not satisfy the expected contract. */
  | { kind: "invalid" };

/** Parses a Retry-After header (seconds) — null when absent or malformed. */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
}

/**
 * Maps a non-2xx response to an {@link ApiFailure}. Invalid/non-JSON bodies
 * (e.g. gateway error pages) degrade to null fields instead of throwing —
 * the failure is still a typed "http" kind with the real status.
 */
export function parseApiFailure(
  status: number,
  envelope: ApiErrorEnvelope | null,
  retryAfterSeconds: number | null
): ApiFailure {
  const error = envelope?.error;
  return {
    kind: "http",
    status,
    code:
      error && typeof error.code === "string"
        ? (error.code as ApiErrorCode)
        : null,
    message: error && typeof error.message === "string" ? error.message : null,
    retryAfterSeconds,
  };
}
