import type { FastifyInstance, FastifyRequest } from "fastify";
import type { GenerationResponse } from "@wallhaze/contracts";
import { AppError } from "../../errors/app-error.js";
import { checkShortWindow } from "../../security/rate-limit.js";
import {
  checkRequestOrigin,
  getClientKey,
} from "../../security/request-guard.js";
import type { ApiEnv } from "../../config/env.js";
import { validateGenerateBody } from "./generation.validators.js";
import type {
  GenerationService,
} from "./generation.service.js";
import { GenerationOutcomeError } from "./generation.service.js";

/** Legacy generation route body limit: 10 MiB (request-guard BODY_MAX_BYTES). */
export const GENERATION_BODY_LIMIT = 10 * 1024 * 1024;

export interface GenerationRouteOptions {
  env: ApiEnv;
  /** Origin allowlist for the request-source guard (CORS + SITE_URL). */
  originAllowlist: ReadonlySet<string>;
  /** False when neither FAL_KEY nor a mock provider is configured → 503. */
  providerConfigured: boolean;
  service: GenerationService;
}

/**
 * True when the request declares an application/json body — media type
 * compared without parameters (`; charset=…` allowed), exactly like the
 * legacy isJsonContentType. Requests WITHOUT this header are rejected 415
 * here; requests with a DIFFERENT registered-media-type header are rejected
 * by Fastify's parser lookup (mapped to 415 in the error handler) — both
 * paths preserve the legacy "415 before any body byte is read" behavior.
 */
function isJsonContentType(request: FastifyRequest): boolean {
  const mediaType = request.headers["content-type"]
    ?.split(";")[0]
    ?.trim()
    ?.toLowerCase();
  return mediaType === "application/json";
}

/**
 * POST /v1/generations — faithful migration of the legacy
 * `app/api/generate/route.ts` guard pipeline. The guard ORDER is preserved:
 *
 *   framework parse (415/413/400) → origin → paused → content-type(absent) →
 *   short-window → provider-configured → body validation →
 *   daily quota → global budget → concurrency → upstream.
 *
 * Two framework-imposed differences (documented in the mapping table, both
 * strictly safer than legacy):
 * - Body parsing happens BEFORE the handler, so a request with an
 *   unregistered/invalid JSON body no longer consumes a short-window slot
 *   (legacy counted it — the window burned on garbage payloads).
 * - The oversized-body check (413) is enforced by Fastify's bodyLimit at
 *   parse time instead of a Content-Length pre-check + streaming cap; the
 *   actual byte count is still authoritative (Content-Length alone can lie).
 *
 * The error envelope shape changed from the legacy flat `{ error: string }`
 * to the unified ApiErrorEnvelope — the human-readable MESSAGE copies are
 * preserved verbatim.
 */
export async function generationRoutes(
  app: FastifyInstance,
  options: GenerationRouteOptions
): Promise<void> {
  app.post(
    "/v1/generations",
    {
      bodyLimit: GENERATION_BODY_LIMIT,
      // Legacy stage 3: reject missing content-type before anything else.
      // (Wrong-but-present content types fail at parser lookup — see above.)
      preValidation: async (request: FastifyRequest) => {
        if (!isJsonContentType(request)) {
          request.log.info({
            event: "generate",
            outcome: "rejected:content-type",
            status: 415,
          });
          throw new AppError(
            "UNSUPPORTED_MEDIA_TYPE",
            "Unsupported content type — expected application/json."
          );
        }
      },
    },
    async (
      request,
      reply
    ): Promise<GenerationResponse> => {
      const startedAt = Date.now();
      // Fastify generates a safe non-identifying uuid per request (genReqId).
      const logOutcome = (outcome: string, status: number): void => {
        request.log.info({
          event: "generate",
          outcome,
          status,
          durationMs: Date.now() - startedAt,
        });
      };

      // 1) Request-source guard (Origin / Fetch Metadata). Not authentication
      //    — a scripted client can forge these headers — but it stops
      //    browser-based cross-site requests. Origin-less requests still pass
      //    every check below.
      const originCheck = checkRequestOrigin(
        request.headers,
        options.originAllowlist
      );
      if (!originCheck.allowed) {
        logOutcome(`rejected:${originCheck.reason}`, 403);
        throw new AppError("FORBIDDEN", "Request origin is not allowed");
      }

      // 2) Route-local pause switch. OFF by default; operators set
      //    GENERATION_PAUSED=1 (or "true"). No config file is required.
      const generationPaused = ["1", "true"].includes(
        (options.env.GENERATION_PAUSED ?? "").toLowerCase()
      );
      if (generationPaused) {
        logOutcome("paused", 503);
        throw new AppError(
          "SERVICE_UNAVAILABLE",
          "Image generation is paused by the server. Please try again later."
        );
      }

      // 3) Short-window rate limit. Until a trusted proxy identity exists
      //    (TRUST_PROXY), ALL requests share one conservative bucket, so the
      //    per-key limits below are effectively global. Every request
      //    reaching this line is counted.
      const clientKey = getClientKey(request.headers, options.env);
      const shortWindow = checkShortWindow(clientKey);
      if (!shortWindow.allowed) {
        logOutcome("rejected:short-window", 429);
        throw new AppError(
          "RATE_LIMITED",
          "Too many requests — please slow down and try again in a moment.",
          { retryAfterSeconds: shortWindow.retryAfterSeconds }
        );
      }

      // 4) Provider configuration gate (legacy: FAL_KEY presence). Returns
      //    503 without a structured outcome line — exactly like the legacy
      //    route, which answered this before any body byte was read.
      if (!options.providerConfigured) {
        throw new AppError(
          "SERVICE_UNAVAILABLE",
          "AI generation is not configured yet. Please try again later."
        );
      }

      // Client-disconnect signal. Fastify's inject() never disconnects, so
      // the abort path cannot fire in-process tests — the mechanism is kept
      // for parity with the legacy request.signal: a premature socket close
      // (response not yet written) aborts the merged upstream signal. The
      // upstream 120s timeout lives in the provider (AbortSignal.any).
      //
      // Next.js → Fastify difference (verified against Node v22): the
      // IncomingMessage (request.raw) emits 'close' the moment Fastify
      // consumes the body — long before the response — so it can neither
      // detect a mid-upstream disconnect nor distinguish one. The
      // ServerResponse (reply.raw) 'close' event is the reliable signal:
      // it fires on connection termination AND on normal completion, and
      // `writableEnded === false` isolates the premature-termination case.
      const clientAbort = new AbortController();
      reply.raw.on("close", () => {
        if (!reply.raw.writableEnded) clientAbort.abort();
      });

      // 5) Domain validation + prompt composition (order preserved exactly:
      //    device → preset → ratio → prompt → style → reference image →
      //    composition). The synchronous route is image-only; video always
      //    goes through the async job endpoint.
      const mediaType = (request.body as { mediaType?: unknown } | null)?.mediaType;
      if (mediaType === "video") {
        throw new AppError(
          "VALIDATION_ERROR",
          "Video generation uses the async job endpoint (POST /v1/generations/jobs)."
        );
      }
      if (mediaType !== undefined && mediaType !== "image") {
        throw new AppError("VALIDATION_ERROR", "Invalid mediaType");
      }
      const validation = validateGenerateBody(request.body);
      if (!validation.ok) {
        logOutcome(validation.logOutcome, validation.status);
        const code =
          validation.status === 413
            ? "PAYLOAD_TOO_LARGE"
            : validation.status === 500
              ? "INTERNAL_ERROR"
              : "VALIDATION_ERROR";
        throw new AppError(code, validation.message);
      }

      // 6) Quota → budget → concurrency → upstream (the service owns this
      //    block and attaches the legacy log outcome to every failure).
      try {
        const result = await options.service.generate({
          clientKey,
          validated: validation.value,
          clientSignal: clientAbort.signal,
        });
        logOutcome("success", 200);
        return result;
      } catch (error) {
        if (error instanceof GenerationOutcomeError) {
          logOutcome(error.logOutcome, error.statusCode);
        }
        throw error;
      }
    }
  );
}
