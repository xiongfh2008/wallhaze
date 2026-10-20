/**
 * Unified API transport for the standalone WallHaze backend (T04-S2).
 *
 * The ONLY place in apps/web that turns a path into a fetch call:
 * - base URL comes from configuration (NEXT_PUBLIC_API_BASE_URL, optionally
 *   overridden per call) — UI components never assemble fetch URLs;
 * - every request has an explicit timeout merged with the caller's
 *   AbortSignal (cancellation support);
 * - non-2xx responses are parsed into the typed ApiFailure model
 *   (stable error code + Retry-After) — HTTP errors never throw;
 * - `fetchImpl` is the Mock Adapter injection point: tests and the Studio
 *   mock mode can substitute an in-process fetch without touching components.
 *
 * The client enforces NO business rules — validation limits live on the
 * backend and in the shared contracts package; the client never duplicates
 * them. It also never imports fal.ai SDKs or touches provider keys.
 */

import type { ApiErrorEnvelope } from "@wallhaze/contracts";
import { parseApiFailure, parseRetryAfter, type ApiFailure } from "./errors";

/**
 * Default per-request timeout. Deliberately generous — the generation
 * endpoint may legitimately take up to ~120 s upstream; call sites that need
 * a different budget override `timeoutMs` (see GENERATION_TIMEOUT_MS).
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

/** Trimmed base URL without trailing slash, or null when not configured. */
export function resolveApiBaseUrl(explicit?: string): string | null {
  const raw = (explicit ?? process.env.NEXT_PUBLIC_API_BASE_URL)?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export interface ApiRequestOptions {
  method?: "GET" | "POST";
  /** JSON body — serialized here; undefined omits both body and header. */
  body?: unknown;
  /** Extra headers (e.g. idempotency keys later — not business rules). */
  headers?: Record<string, string>;
  /** Caller-controlled cancellation; merged with the timeout signal. */
  signal?: AbortSignal;
  /** Per-request timeout; defaults to DEFAULT_REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Base URL override; defaults to NEXT_PUBLIC_API_BASE_URL. */
  baseUrl?: string;
  /** Mock Adapter injection point (tests / Studio mock mode). */
  fetchImpl?: typeof fetch;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; failure: ApiFailure; status: number | null };

/**
 * Performs one JSON API request. Never throws — every outcome is a typed
 * {@link ApiResult}. With no base URL configured the result is "unavailable"
 * and NO request is sent.
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<ApiResult<T>> {
  const base = resolveApiBaseUrl(options.baseUrl);
  if (!base) {
    return { ok: false, failure: { kind: "unavailable" }, status: null };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetchImpl(`${base}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal,
    });
  } catch (error) {
    // Distinguish caller cancellation from the timeout from real network
    // failures — three different failure kinds, never conflated.
    if (options.signal?.aborted) {
      return { ok: false, failure: { kind: "canceled" }, status: null };
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return { ok: false, failure: { kind: "timeout" }, status: null };
    }
    return { ok: false, failure: { kind: "network" }, status: null };
  }

  if (!response.ok) {
    const envelope = (await response
      .json()
      .catch(() => null)) as ApiErrorEnvelope | null;
    return {
      ok: false,
      failure: parseApiFailure(
        response.status,
        envelope,
        parseRetryAfter(response.headers.get("retry-after"))
      ),
      status: response.status,
    };
  }

  // 2xx — parse defensively: the payload must still satisfy the caller's
  // expected contract shape (checked by the caller via the data guards).
  const data = (await response.json().catch(() => null)) as T | null;
  if (data === null) {
    return { ok: false, failure: { kind: "invalid" }, status: response.status };
  }
  return { ok: true, data };
}
