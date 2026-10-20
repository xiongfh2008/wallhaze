import type { FastifyError, FastifyInstance } from "fastify";
import { AppError, errorEnvelope } from "./app-error.js";

/** Legacy client-facing copies preserved verbatim (T04-S2 migration). */
export const LEGACY_MESSAGES = {
  bodyTooLarge: "That request is too large — please use a smaller image.",
  bodyInvalid: "Invalid request body.",
  contentType: "Unsupported content type — expected application/json.",
} as const;

/**
 * Global error mapping. Guarantees that EVERY non-2xx response — including
 * 404s and framework errors — uses the unified ApiErrorEnvelope from
 * packages/contracts and that unknown errors never leak internals.
 *
 * Framework error mapping (Next.js → Fastify differences, verified):
 * - Body over the limit → Fastify content-type-parser error (413), mapped to
 *   PAYLOAD_TOO_LARGE with the legacy copy.
 * - Unregistered content type → Fastify FST_ERR_CTP_INVALID_MEDIA_TYPE (415),
 *   mapped to UNSUPPORTED_MEDIA_TYPE with the legacy copy (the legacy route
 *   answered 415 for non-JSON content types before reading any byte).
 * - Malformed/empty JSON → our strict parser throws AppError(VALIDATION_ERROR).
 */
export async function errorPlugin(app: FastifyInstance): Promise<void> {
  // Fastify v5 types the handler error as `unknown` by default
  // (setErrorHandler<TError = unknown>) — pin the generic to FastifyError.
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.retryAfterSeconds !== undefined) {
        reply.header(
          "Retry-After",
          String(Math.max(1, Math.ceil(error.retryAfterSeconds)))
        );
      }
      return reply
        .status(error.statusCode)
        .send(errorEnvelope(error.code, error.message, error.details));
    }

    const statusCode =
      typeof error.statusCode === "number" ? error.statusCode : undefined;

    // Framework-level body rejections keep the legacy structured-log outcome
    // vocabulary (only the generation route accepts bodies, so these lines
    // are always generation outcomes).
    if (statusCode === 413) {
      request.log.info({ outcome: "rejected:body-too-large", status: 413 });
      return reply
        .status(413)
        .send(
          errorEnvelope("PAYLOAD_TOO_LARGE", LEGACY_MESSAGES.bodyTooLarge)
        );
    }
    if (statusCode === 415) {
      request.log.info({ outcome: "rejected:content-type", status: 415 });
      return reply
        .status(415)
        .send(errorEnvelope("UNSUPPORTED_MEDIA_TYPE", LEGACY_MESSAGES.contentType));
    }
    if (statusCode === 400 || statusCode === 414 || statusCode === 422) {
      request.log.info({ outcome: "rejected:body-invalid", status: 400 });
      return reply
        .status(400)
        .send(errorEnvelope("VALIDATION_ERROR", LEGACY_MESSAGES.bodyInvalid));
    }

    request.log.error({ err: error }, "Unhandled error");
    return reply
      .status(500)
      .send(errorEnvelope("INTERNAL_ERROR", "Internal server error."));
  });

  app.setNotFoundHandler((request, reply) => {
    return reply
      .status(404)
      .send(
        errorEnvelope(
          "NOT_FOUND",
          `Route ${request.method} ${request.url} does not exist.`
        )
      );
  });
}
