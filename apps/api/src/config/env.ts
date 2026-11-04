import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Environment validation (T04-S2). Fails fast with a readable message when
 * configuration is missing or malformed — the server must never boot in an
 * ambiguous state.
 *
 * Secret handling: FAL_KEY is read HERE ONLY and passed straight into the
 * provider. It never reaches logs, responses, or any NEXT_PUBLIC_ variable.
 * FAL_MOCK=1 selects the in-process mock provider — the ONLY mode used in
 * tests (dummy key at most, real network never).
 */

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  /** Comma-separated exact Origin allowlist (browser CORS + origin guard). */
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  /** Optional production origin — extends the origin guard allowlist only. */
  SITE_URL: z.string().optional(),
  /** "1" trusts X-Real-IP for limiter keys (see security/request-guard.ts). */
  TRUST_PROXY: z.string().optional(),
  /** "1"/"true" pauses generation with 503 (operators' pause switch). */
  GENERATION_PAUSED: z.string().optional(),
  /**
   * Commercialization business gates — independent of the underlying
   * service switches above. All default CLOSED: a configured PSP or AI key
   * never opens purchasing or generation on its own. The API routes enforce
   * these server-side (final interception); the web app only renders state.
   */
  /** "1" allows users to START new credit purchases. */
  PURCHASES_PUBLIC_ENABLED: z.string().optional(),
  /** "1" allows users to START new generation jobs (AI Studio). */
  STUDIO_PUBLIC_ENABLED: z.string().optional(),
  /** "1" allows PAID video jobs on top of STUDIO_PUBLIC_ENABLED. */
  VIDEO_PUBLIC_ENABLED: z.string().optional(),
  /**
   * "1" temporarily refuses NEW checkouts only. Webhooks, refunds, sync,
   * order queries and credit grants for already-paid orders stay live.
   */
  PURCHASES_PAUSED: z.string().optional(),
  /** Global JSON body limit in bytes. */
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),
  /** fal.ai key — server-only, never logged, never sent to any client. */
  FAL_KEY: z.string().optional(),
  /** "1" forces the in-process mock provider (test/dummy mode). */
  FAL_MOCK: z.string().optional(),
  /**
   * Explicit opt-in for REAL fal.ai calls. Required together with FAL_KEY;
   * a configured key alone never enables paid traffic.
   */
  FAL_LIVE_ENABLED: z.string().optional(),
  /**
   * SEPARATE opt-in for paid video calls. Both FAL_LIVE_ENABLED=1 AND
   * FAL_VIDEO_LIVE_ENABLED=1 (plus FAL_KEY) are required; enabling image
   * live traffic alone never enables video billing.
   */
  FAL_VIDEO_LIVE_ENABLED: z.string().optional(),
  /** PostgreSQL connection string (production path). */
  DATABASE_URL: z.string().optional(),
  /**
   * Local development database directory (PGlite, single-process). Ignored
   * when DATABASE_URL is set; never use it for production.
   */
  PGLITE_DIR: z.string().optional(),
  /** HMAC secret for the mock payment adapter (dev/test only). */
  PAYMENT_MOCK_SECRET: z.string().optional(),
  /** Directory for the local private image store (unset = in-memory). */
  STORAGE_DIR: z.string().optional(),
  /**
   * Private-media storage driver: "local" (default; STORAGE_DIR/Memory) or
   * "r2" (Cloudflare R2 via the S3 API — requires the R2_* set below).
   */
  STORAGE_DRIVER: z.enum(["local", "r2"]).optional(),
  /** Account-level S3 endpoint: https://<account>.r2.cloudflarestorage.com */
  R2_ENDPOINT: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  /** Private bucket for user-generated media (never public). */
  R2_BUCKET: z.string().optional(),
  /** Public/verified media bucket (Gallery, Community). Unused by the adapter
   *  itself; reserved for the public-media pipeline. */
  R2_PUBLIC_BUCKET: z.string().optional(),
  /** Persisted per-user daily AI cost budget in micro units (unset = none). */
  USER_DAILY_COST_LIMIT_MICROS: z.coerce.number().int().positive().optional(),
  /**
   * Platform-wide daily AI cost bound in micro units (unset = none).
   * 0 is valid and rejects every new job — a hard spend stop.
   */
  PLATFORM_DAILY_COST_LIMIT_MICROS: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional(),
  /** "1" runs the worker loop inside the API process (PGlite dev only). */
  EMBED_WORKER: z.string().optional(),
  /**
   * Explicit opt-in for ACTUAL expired-media object deletion. Unset means
   * the ops cleanup reports a dry run only. Existing media is never selected
   * because only new assets use the temporary_30d retention policy.
   */
  MEDIA_RETENTION_CLEANUP_ENABLED: z.string().optional(),
  /** Worker CLI tuning. */
  WORKER_POLL_MS: z.coerce.number().int().positive().optional(),
  WORKER_LEASE_SECONDS: z.coerce.number().int().positive().optional(),
  /** HMAC secret for short-lived private image URLs. */
  IMAGE_URL_SECRET: z.string().optional(),
  /**
   * Dev-only token for POST /internal/shutdown (used by `npm run stop`).
   * When unset the endpoint is not registered at all.
   */
  OPS_SHUTDOWN_TOKEN: z.string().optional(),
  /** Public base URL of this API (defaults to http://localhost:PORT). */
  API_PUBLIC_URL: z.string().url().optional(),
  /** Public web origin users return to after OAuth (defaults to first CORS origin). */
  WEB_APP_URL: z.string().url().optional(),
  /** Google OAuth Web client — both empty means "Google sign-in not configured". */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Exact redirect URI registered in the Google Cloud console. */
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
  /** HMAC secret for the OAuth state cookie (falls back to IMAGE_URL_SECRET). */
  OAUTH_STATE_SECRET: z.string().optional(),
  /**
   * Payment provider:
   *  - "waffo": live PSP (requires merchant credentials).
   *  - "mock": dev/test only; production refuses it.
   *  - "disabled": production-safe value for "purchases closed" — the API
   *    boots, checkout reports unavailable, and no payment adapter is wired.
   */
  PAYMENT_PROVIDER: z.enum(["mock", "waffo", "disabled"]).default("mock"),
  /**
   * LOCAL/E2E ONLY: exposes checkoutAvailable=true while PAYMENT_PROVIDER=mock
   * so the browser purchase flow can be exercised end to end. Production can
   * never reach this path — PAYMENT_PROVIDER=mock refuses to boot when
   * NODE_ENV=production. NEVER set this in a deployed environment.
   */
  MOCK_CHECKOUT_PUBLIC: z.string().optional(),
  /** Provider environment — selects test vs prod keys/behavior. */
  PAYMENT_ENVIRONMENT: z.enum(["test", "prod"]).default("test"),
  /** Waffo Pancake merchant id (MER_...). */
  /**
   * Prompt Sift screening uses the SAME merchant credentials as payments
   * (official docs: "uses existing payment API Key"): WAFFO_MERCHANT_ID +
   * WAFFO_PRIVATE_KEY (RSA-SHA256 request signing). Missing either means
   * screening is not configured: live generation fails closed.
   */
  WAFFO_MODERATION_ENDPOINT: z.string().optional(),
  /** Prompt Sift semantic mode: "off" | "shadow" | "enforce". Default enforce. */
  WAFFO_MODERATION_SEMANTIC: z.enum(["off", "shadow", "enforce"]).optional(),
  /** Total seconds a verdict=review is held and re-scanned before the job
   *  fails (official policy: hold and retry; no query/callback API). */
  WAFFO_MODERATION_REVIEW_MAX_WAIT_SECONDS: z.coerce.number().int().positive().max(600).optional(),
  /** Seconds between review re-scans. Default 30. */
  WAFFO_MODERATION_REVIEW_RETRY_INTERVAL_SECONDS: z.coerce.number().int().positive().max(300).optional(),
  WAFFO_MERCHANT_ID: z.string().optional(),
  /** Waffo store id (STO_...) used for product/webhook management. */
  WAFFO_STORE_ID: z.string().optional(),
  /** Waffo RSA private key: PEM or raw base64 (server-only). */
  WAFFO_PRIVATE_KEY: z.string().optional(),
  /**
   * Output moderation (AIGC stage 2) — OpenAI Moderation API
   * (omni-moderation-latest, image-capable; video is screened frame by
   * frame). Empty = output screening not configured: live generated media
   * is never stored or published (fail closed). Mock output skips it.
   */
  OUTPUT_MODERATION_API_KEY: z.string().optional(),
  OUTPUT_MODERATION_ENDPOINT: z.string().optional(),
  /**
   * fal NSFW output-screening block threshold (0..1, default 0.5). Only used
   * when OUTPUT_MODERATION_API_KEY is absent (fal backend is the default).
   */
  FAL_NSFW_THRESHOLD: z.string().optional(),
  OUTPUT_MODERATION_MODEL: z.string().optional(),
  /** Frames sampled per generated video (1..10, default 5). */
  OUTPUT_MODERATION_FRAMES: z.coerce.number().int().positive().max(10).optional(),
  /** ffmpeg binary used for video frame extraction (default "ffmpeg"). */
  FFMPEG_PATH: z.string().optional(),
  /** ffprobe binary (default "ffprobe"). */
  FFPROBE_PATH: z.string().optional(),
  /** Published-gallery manifest consumed by the gallery-rescan job
   *  (AIGC stage 3: async re-scan of publicly visible works). */
  GALLERY_RESCAN_MANIFEST_URL: z.string().optional(),
});

export type ApiEnv = z.infer<typeof envSchema>;

/** Parses and validates an environment source; throws on the first problem. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  return parsed.data;
}

/** Splits the CORS allowlist env var into trimmed, non-empty origins. */
export function corsOriginList(env: ApiEnv): string[] {
  return env.CORS_ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Minimal .env loader for the process entry points (server/worker/ops/
 * scripts). Node 20 does not ship `--env-file-if-exists`, and adding a
 * dependency for this is unnecessary. Existing environment variables always
 * win; the file is optional.
 */
export function loadEnvFile(
  path = ".env",
  target: NodeJS.ProcessEnv = process.env
): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (target[key] === undefined) target[key] = value;
  }
}
