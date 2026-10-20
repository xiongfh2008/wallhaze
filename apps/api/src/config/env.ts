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
