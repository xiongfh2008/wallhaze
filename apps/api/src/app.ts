import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
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
import type { Database } from "./db/database.js";
import { migrate } from "./db/migrate.js";
import { AuthService } from "./business/auth.js";
import {
  DisabledPaymentAdapter,
  MockPaymentAdapter,
  PaymentService,
} from "./business/payment.js";
import { WaffoPaymentAdapter } from "./business/waffo.js";
import { WaffoPancake } from "@waffo/pancake-ts";
import { businessRoutes } from "./business/routes.js";
import type { OAuthRoutesOptions } from "./business/routes.js";
import {
  DisabledOAuthProvider,
  GoogleOAuthProvider,
} from "./business/oauth.js";
import {
  isFlagEnabled,
  resolveGenerationMode,
  type GenerationMode,
} from "./business/provider-mode.js";
import { opsRoutes } from "./modules/ops/shutdown.routes.js";
import {
  LocalStorage,
  MemoryStorage,
  type PrivateStorage,
} from "./business/storage.js";
import type { VideoJobProvider } from "./modules/generation/video.providers.js";

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
   * Video adapters (tests / server wiring). Presence enables video jobs and
   * capability pricing; absent means video is unavailable even in mock mode.
   */
  videoProviders?: {
    imageToVideo: VideoJobProvider;
    textToVideo: VideoJobProvider;
  };
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
  /**
   * Business database (R03–R06). When provided, migrations run on boot and
   * the auth/credits/payment/creations routes are registered. Absent → the
   * API serves only the T04-S1/T04-S2 surface (health, sync generations,
   * image proxy) — the shape legacy suites assert.
   */
  database?: Database;
  /** HMAC secret for the mock payment adapter (tests). */
  paymentSecret?: string;
  /** Private image store override (tests / embedded worker). Defaults by env.STORAGE_DIR. */
  storage?: PrivateStorage;
  /** Daily per-user AI cost budget override in micro units (tests). */
  userDailyCostLimitMicros?: number | null;
  /** OAuth override — tests inject a fake provider; production derives it from env. */
  oauth?: OAuthRoutesOptions;
  /** Generation mode override (tests / explicit bootstraps). */
  generationMode?: GenerationMode;
  /** Platform-wide daily AI cost bound in micro units; null/undefined = none. */
  platformDailyCostMicrosLimit?: number | null;
  /** Generation pause override; defaults to the env flag. */
  generationPaused?: boolean;
  /**
   * Dev-only graceful-stop token. When set (and NODE_ENV !== "production")
   * the API registers POST /internal/shutdown; `npm run stop` uses it so a
   * local restart closes PGlite cleanly instead of hard-killing it.
   */
  opsShutdownToken?: string;
  /** Invoked after the stop endpoint answers 202. */
  onShutdownRequested?: (source: string) => void;
}

/**
 * Provider selection (T04-S2):
 * 1. explicit buildApp option (tests) wins;
 * 2. FAL_MOCK=1 → in-process mock provider (test/dummy mode, no network);
 * 3. FAL_LIVE_ENABLED=1 AND FAL_KEY → real provider (explicit paid opt-in);
 * 4. otherwise undefined → the generation route answers 503 not-configured.
 *
 * A configured key alone never enables real billing (see provider-mode.ts).
 * FAL_KEY is read HERE ONLY and passed straight into the provider. It never
 * reaches logs, responses, or any client-visible surface.
 */
function selectProvider(
  env: ApiEnv,
  options: BuildAppOptions
): FalProvider | undefined {
  if (options.provider) return options.provider;
  const mode = resolveGenerationMode(env);
  if (mode === "mock") return createMockProvider();
  if (mode === "live" && env.FAL_KEY) {
    return createFalProvider({
      fetchImpl: options.upstreamFetch ?? fetch,
      falKey: env.FAL_KEY,
    });
  }
  return undefined;
}

/**
 * Payment adapter selection. Production REFUSES the mock adapter — a build
 * without real PSP credentials must fail to boot rather than silently take
 * fake payments. Tests inject their own service entirely.
 */
function createPaymentService(
  options: BuildAppOptions,
  env: ApiEnv,
  origins: string[]
): PaymentService {
  if (!options.database) {
    throw new Error("createPaymentService requires a database");
  }
  if (env.PAYMENT_PROVIDER === "waffo") {
    if (!env.WAFFO_MERCHANT_ID || !env.WAFFO_PRIVATE_KEY) {
      throw new Error(
        "Invalid environment configuration — WAFFO_MERCHANT_ID and WAFFO_PRIVATE_KEY are required for PAYMENT_PROVIDER=waffo"
      );
    }
    const client = new WaffoPancake({
      merchantId: env.WAFFO_MERCHANT_ID,
      privateKey: env.WAFFO_PRIVATE_KEY,
    });
    return new PaymentService(
      options.database,
      new WaffoPaymentAdapter(client, env.PAYMENT_ENVIRONMENT),
      origins
    );
  }
  if (env.PAYMENT_PROVIDER === "disabled") {
    // Purchases closed: no adapter is wired and checkout reports unavailable
    // (routes.ts maps checkoutAvailable off PAYMENT_PROVIDER === "waffo").
    return new PaymentService(
      options.database,
      new DisabledPaymentAdapter(),
      origins
    );
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Invalid environment configuration — the mock payment adapter is not allowed in production; set PAYMENT_PROVIDER=waffo or disabled"
    );
  }
  return new PaymentService(
    options.database,
    new MockPaymentAdapter(
      options.paymentSecret ?? env.PAYMENT_MOCK_SECRET ?? "dev-only-mock-secret"
    ),
    origins
  );
}

/**
 * Google OAuth configuration. Without a client id + secret the API registers
 * an honestly disabled provider: the status endpoint says so and the start
 * route refuses — it never fakes a Google sign-in.
 *
 * The state cookie is signed with OAUTH_STATE_SECRET, which MUST be an
 * independent random secret (never IMAGE_URL_SECRET or a built-in default).
 * When Google is configured but the secret is missing/short/reused, startup
 * fails instead of falling back to a weaker key.
 */
export function resolveOAuthOptions(
  env: ApiEnv,
  origins: string[],
  secureCookies: boolean,
  fetchImpl: typeof fetch
): OAuthRoutesOptions {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const configured = Boolean(clientId && clientSecret);
  const stateSecret = env.OAUTH_STATE_SECRET;
  if (configured) {
    if (!stateSecret) {
      throw new Error(
        "Invalid environment configuration — OAUTH_STATE_SECRET is required when Google sign-in is configured. " +
          "Generate an independent secret with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    if (env.IMAGE_URL_SECRET && stateSecret === env.IMAGE_URL_SECRET) {
      throw new Error(
        "Invalid environment configuration — OAUTH_STATE_SECRET must be independent from IMAGE_URL_SECRET"
      );
    }
    if (stateSecret.length < 32) {
      throw new Error(
        "Invalid environment configuration — OAUTH_STATE_SECRET must be at least 32 characters"
      );
    }
  }
  const webBaseUrl = (
    env.WEB_APP_URL ??
    origins[0] ??
    "http://localhost:3100"
  ).replace(/\/+$/, "");
  const apiBase = (
    env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`
  ).replace(/\/+$/, "");
  return {
    provider: configured
      ? new GoogleOAuthProvider({
          clientId: clientId!,
          clientSecret: clientSecret!,
          fetchImpl,
        })
      : new DisabledOAuthProvider(),
    redirectUri:
      env.GOOGLE_OAUTH_REDIRECT_URI ??
      `${apiBase}/v1/auth/oauth/google/callback`,
    webBaseUrl,
    stateSecret: stateSecret ?? "",
    secureCookies,
  };
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
  // Explicit live opt-in: a configured FAL_KEY alone must not enable billing.
  const generationMode =
    options.generationMode ??
    (options.provider ? "live" : resolveGenerationMode(env));
  const generationPaused =
    options.generationPaused ?? isFlagEnabled(env.GENERATION_PAUSED);

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
      // Raw bytes travel with the request so signature verification (the
      // payment webhook) sees exactly what the provider signed.
      (request as FastifyRequest & { rawBody?: Buffer }).rawBody = body as Buffer;
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

  if (options.database) {
    await migrate(options.database);
    const origins = corsOriginList(env);
    const secureCookies =
      origins.some((origin) => origin.startsWith("https://")) ||
      (env.SITE_URL?.startsWith("https://") ?? false);
    // Production must not fall back to a well-known signing secret: signed
    // image URLs would then be forgeable by anyone reading this source.
    if (env.NODE_ENV === "production" && !env.IMAGE_URL_SECRET) {
      throw new Error(
        "Invalid environment configuration — IMAGE_URL_SECRET is required in production"
      );
    }
    const storage =
      options.storage ?? (env.STORAGE_DIR ? new LocalStorage(env.STORAGE_DIR) : new MemoryStorage());
    const payments = createPaymentService(options, env, origins);
    const oauth =
      options.oauth ??
      resolveOAuthOptions(
        env,
        origins,
        secureCookies,
        options.upstreamFetch ?? fetch
      );
    await app.register(businessRoutes, {
      db: options.database,
      auth: new AuthService(options.database),
      payments,
      storage,
      originAllowlist: buildOriginAllowlist(env),
      secureCookies,
      oauth,
      generationMode,
      generationPaused,
      videoAvailable: Boolean(options.videoProviders),
      platformDailyCostMicrosLimit:
        options.platformDailyCostMicrosLimit ??
        env.PLATFORM_DAILY_COST_LIMIT_MICROS ??
        null,
      userDailyCostLimitMicros:
        options.userDailyCostLimitMicros ??
        env.USER_DAILY_COST_LIMIT_MICROS ??
        null,
      imageSigningSecret:
        env.IMAGE_URL_SECRET ?? options.paymentSecret ?? "dev-only-image-secret",
      paymentProvider: env.PAYMENT_PROVIDER,
      checkoutAvailable: env.PAYMENT_PROVIDER === "waffo",
      mockMode: generationMode === "mock",
    });
  }

  // Dev-only graceful stop. Production never registers it, and without a
  // configured token the route does not exist at all (404).
  if (
    env.NODE_ENV !== "production" &&
    options.opsShutdownToken &&
    options.onShutdownRequested
  ) {
    await app.register(opsRoutes, {
      token: options.opsShutdownToken,
      onShutdownRequested: options.onShutdownRequested,
    });
  }

  await app.ready();
  return { app, env };
}
