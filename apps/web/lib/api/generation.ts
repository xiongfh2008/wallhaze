/**
 * Generation API calls (T04-S2). Thin, typed wrapper over the unified
 * transport — no business rules, no URL assembly, no direct fal.ai access.
 *
 * Outcome shape is UNCHANGED from T04-S1 so existing consumers keep working:
 * a generation attempt resolves to a success payload or a typed failure and
 * NEVER rejects. New in S2: "timeout" and "canceled" reasons (the caller can
 * pass an AbortSignal) and stable error codes available on http failures via
 * the shared envelope.
 */

import type {
  ApiErrorCode,
  GenerationRequest,
  GenerationResponse,
} from "@wallhaze/contracts";
import { apiRequest, type ApiRequestOptions } from "./client";

/**
 * Generation requests may legitimately take up to ~120 s (the backend's
 * hard upstream timeout). The client budget sits above it so the timeout
 * here only fires for a genuinely wedged backend, never for a healthy one.
 */
export const GENERATION_TIMEOUT_MS = 150_000;

/** Backend route for wallpaper generation (packages/contracts/openapi.yaml). */
const GENERATIONS_PATH = "/v1/generations";

/** Why a generation attempt did not produce an image. */
export type GenerateFailureReason =
  /** API base URL not configured — nothing was sent at all. */
  | "unavailable"
  /** fetch itself failed (offline, DNS, CORS). */
  | "network"
  /** The request timed out before a response arrived. */
  | "timeout"
  /** The caller-provided AbortSignal canceled the request. */
  | "canceled"
  /** API replied with a non-2xx status; message comes from the error envelope. */
  | "http"
  /** 2xx but the body does not satisfy the contract. */
  | "invalid";

export type GenerateOutcome =
  | ({ ok: true; mock?: boolean } & GenerationResponse)
  | {
      ok: false;
      reason: GenerateFailureReason;
      message: string | null;
      /**
       * Present on `http` failures: the backend's stable error code from
       * the unified envelope — callers branch on this, never on message
       * text. Null when the body was not parseable.
       */
      code?: ApiErrorCode | null;
      /**
       * Present on `http` failures: server-provided Retry-After in seconds
       * (already ceil-rounded, null when absent). Display it verbatim —
       * never invent a backoff value.
       */
      retryAfterSeconds?: number | null;
    };

/**
 * Requests one wallpaper generation from the standalone API. Resolves to a
 * success payload (contract GenerationResponse) or a typed failure — never
 * rejects.
 */
export async function generateWallpaper(
  input: GenerationRequest,
  options: ApiRequestOptions = {}
): Promise<GenerateOutcome> {
  const result = await apiRequest<GenerationResponse>(GENERATIONS_PATH, {
    ...options,
    method: "POST",
    body: input,
    timeoutMs: options.timeoutMs ?? GENERATION_TIMEOUT_MS,
  });

  if (!result.ok) {
    const failure = result.failure;
    return {
      ok: false,
      // failure kinds map one-to-one onto GenerateFailureReason except
      // "http", whose envelope details travel alongside the message.
      reason:
        failure.kind === "http"
          ? "http"
          : (failure.kind as Exclude<
              GenerateFailureReason,
              "http"
            >),
      message: failure.kind === "http" ? failure.message : null,
      ...(failure.kind === "http"
        ? { code: failure.code, retryAfterSeconds: failure.retryAfterSeconds }
        : {}),
    };
  }

  const data = result.data;
  if (typeof data?.imageUrl !== "string") {
    return { ok: false, reason: "invalid", message: null };
  }
  return {
    ok: true,
    imageUrl: data.imageUrl,
    width: data.width ?? null,
    height: data.height ?? null,
    contentType: data.contentType ?? null,
  };
}
