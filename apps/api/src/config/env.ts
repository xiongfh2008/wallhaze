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
   * Payment provider: "mock" (default in development/test) or "waffo".
   * Production refuses the mock adapter.
   */
  PAYMENT_PROVIDER: z.enum(["mock", "waffo"]).default("mock"),
  /** Provider environment — selects test vs prod keys/behavior. */
  PAYMENT_ENVIRONMENT: z.enum(["test", "prod"]).default("test"),
  /** Waffo Pancake merchant id (MER_...). */
  WAFFO_MERCHANT_ID: z.string().optional(),
  /** Waffo store id (STO_...) used for product/webhook management. */
  WAFFO_STORE_ID: z.string().optional(),
  /** Waffo RSA private key: PEM or raw base64 (server-only). */
  WAFFO_PRIVATE_KEY: z.string().optional(),
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
