import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { corsOriginList, loadEnv, type ApiEnv } from "./config/env.js";
import { AppError } from "./errors/app-error.js";
import { errorPlugin, LEGACY_MESSAGES } from "./errors/error-handler.js";
import { corsPlugin } from "./middleware/cors.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { generationRoutes } from "./modules/generation/generation.routes.js";
import { createGenerationService } from "./modules/generation/generation.service.js";
import {
  createFalProvider,
  createMockProvider,
  type FalProvider,
} from "./modules/generation/fal.provider.js";
import { imageProxyRoutes } from "./modules/images/images.routes.js";
import { buildOriginAllowlist } from "./security/request-guard.js";

export const API_VERSION = "0.2.0";

export interface BuildAppOptions {
  /**
   * Environment source; defaults to process.env. Tests inject a minimal
   * object so suites never depend on the developer's real environment.
   */
  env?: NodeJS.ProcessEnv;
  /**
   * Pre-built fal provider (tests). Overrides the env-based selection below
   * entirely — the ONLY way suites wire an upstream without network access.
   */
  provider?: FalProvider;
  /**
   * Outbound fetch used by the real fal provider AND the image proxy.
   * Defaults to globalThis.fetch; tests inject a controlled in-process
   * replacement so no test can reach the real network.
   */
  upstreamFetch?: typeof fetch;
  /**
   * Pino-compatible stream for asserting structured logs in tests (the
   * legacy suite asserted outcome log lines; the new suite does the same).
   */
  loggerStream?: { write(chunk: string): void };
}

/**
 * Provider selection (T04-S2):
 * 1. explicit buildApp option (tests) wins;
 * 2. FAL_MOCK=1 → in-process mock provider (test/dummy mode, no network);
 * 3. FAL_KEY set → real provider (production path, fetch + injected key);
 * 4. otherwise undefined → the generation route answers 503 not-configured.
 *
 * FAL_KEY is read HERE ONLY and passed straight into the provider. It never
 * reaches logs, responses, or any client-visible surface.
 */
function selectProvider(
  env: ApiEnv,
  options: BuildAppOptions
): FalProvider | undefined {
  if (options.provider) return options.provider;
  if (["1", "true"].includes((env.FAL_MOCK ?? "").toLowerCase())) {
    return createMockProvider();
  }
  if (env.FAL_KEY) {
    return createFalProvider({
      fetchImpl: options.upstreamFetch ?? fetch,
      falKey: env.FAL_KEY,
    });
  }
  return undefined;
}

/**
 * Builds a fully-wired Fastify instance that is NOT listening — tests drive
 * it with app.inject(), the production entry point (server.ts) calls
 * app.listen().
 *
 * T04-S2 body pipeline (Next.js → Fastify differences, deliberately handled):
 * - A custom application/json content-type parser enforces the legacy
 *   request-guard semantics: strict (fatal) UTF-8 decoding + JSON.parse,
 *   with malformed/empty bodies mapped to 400 "Invalid request body.".
 * - Oversized bodies are rejected by Fastify's bodyLimit (per-route 10 MiB
 *   for generation, the legacy BODY_MAX_BYTES) and mapped to 413 with the
 *   legacy copy in the error handler.
 * - Unregistered content types fail parser lookup and are mapped to 415 —
 *   the legacy "415 before any body byte is read" behavior.
 */
export async function buildApp(
  options: BuildAppOptions = {}
): Promise<{ app: FastifyInstance; env: ApiEnv }> {
  const env = loadEnv(options.env);

  const app = Fastify({
    bodyLimit: env.BODY_LIMIT_BYTES,
    genReqId: () => randomUUID(),
    trustProxy: false,
    logger: {
      level: env.LOG_LEVEL,
      ...(options.loggerStream ? { stream: options.loggerStream } : {}),
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie"],
        censor: "[REDACTED]",
      },
    },
  });

  // Strict JSON body parsing — mirrors lib/server/request-guard.ts
  // readJsonBody: fatal UTF-8, JSON.parse, 400 on ANY failure (empty body
  // included: JSON.parse("") throws).
  const strictUtf8 = new TextDecoder("utf-8", { fatal: true });
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      try {
        done(null, JSON.parse(strictUtf8.decode(body as Buffer)));
      } catch {
        // Legacy structured-log vocabulary: the malformed-body rejection is
        // visible in the request's outcome log (legacy GEN-16 parity).
        request.log.info({
          event: "generate",
          outcome: "rejected:body-invalid",
          status: 400,
        });
        done(
          new AppError("VALIDATION_ERROR", LEGACY_MESSAGES.bodyInvalid)
        );
      }
    }
  );

  // Echo the request id on every response, errors included.
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  const provider = selectProvider(env, options);

  // Applied DIRECTLY on the root instance (NOT via app.register): Fastify
  // encapsulates setErrorHandler/addHook per plugin, so a sibling plugin's
  // handler would never cover the routes registered next to it.
  await errorPlugin(app);
  await corsPlugin(app, { allowedOrigins: corsOriginList(env) });
  await app.register(healthRoutes, { version: API_VERSION });
  await app.register(generationRoutes, {
    env,
    originAllowlist: buildOriginAllowlist(env),
    providerConfigured: provider !== undefined,
    // When no provider is configured the route 503s before the service is
    // ever reached; the mock here is an inert placeholder for that path and
    // performs no I/O.
    service: createGenerationService({
      provider: provider ?? createMockProvider(),
    }),
  });
  await app.register(imageProxyRoutes, {
    fetchImpl: options.upstreamFetch ?? fetch,
  });

  await app.ready();
  return { app, env };
}
