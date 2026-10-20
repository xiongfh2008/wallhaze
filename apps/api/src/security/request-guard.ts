import type { IncomingHttpHeaders } from "node:http";
import type { ApiEnv } from "../config/env.js";

/**
 * Request-intake guards for the generation API (T04-S2 migration of
 * lib/server/request-guard.ts).
 *
 * Faithful port of the legacy semantics with one architectural change: the
 * allowlist is injected instead of read from process.env inside the function
 * (Fastify apps build it once at boot from CORS_ALLOWED_ORIGINS + SITE_URL).
 *
 * Honest capability notes (do not oversell):
 * - Origin / Fetch Metadata checks are NOT authentication. Any non-browser
 *   client can forge both headers freely. They stop browser-based cross-site
 *   requests; abuse from scripted clients is the rate limiter's job.
 * - Client identification is deliberately conservative: until a trusted
 *   reverse-proxy identity exists, ALL requests share one limiter bucket.
 */

/**
 * Parses a candidate origin and returns its canonical form, or null when the
 * value is not a plain scheme://host[:port] origin. Parsing with `new URL`
 * (instead of string matching) makes the comparison immune to casing,
 * default-port and encoding tricks; values carrying a path, query, hash or
 * credentials are not Origins at all and fail closed.
 */
export function canonicalOrigin(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.username !== "" || url.password !== "") return null;
    if (url.pathname !== "" && url.pathname !== "/") return null;
    if (url.search !== "" || url.hash !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Builds the Origin allowlist for the origin guard:
 * CORS_ALLOWED_ORIGINS (exact entries) + canonical SITE_URL when set.
 * An invalid SITE_URL is ignored — it can never loosen the allowlist into a
 * wildcard. Unlike the legacy route there is NO hard-coded localhost entry:
 * development origins are configured explicitly (fail-closed by default).
 */
export function buildOriginAllowlist(env: ApiEnv): Set<string> {
  const origins = new Set<string>();
  for (const origin of corsOriginListSafe(env)) origins.add(origin);
  const siteUrl = env.SITE_URL?.trim();
  if (siteUrl) {
    const canonical = canonicalOrigin(siteUrl);
    if (canonical) origins.add(canonical);
  }
  return origins;
}

function corsOriginListSafe(env: ApiEnv): string[] {
  return env.CORS_ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => canonicalOrigin(origin))
    .filter((origin): origin is string => origin !== null);
}

export interface OriginDecision {
  allowed: boolean;
  /** Rejection reason — for logs only, never surfaced to clients. */
  reason?: "cross-site-fetch-metadata" | "origin-not-allowed";
}

/**
 * Validates the request source (order preserved from the legacy route):
 * 1. `Sec-Fetch-Site: cross-site` → reject (browser-asserted, cheapest check).
 * 2. `Origin` present → must be in the allowlist, else reject.
 * 3. `Origin` absent (curl, scripts) → allow; such requests still pass
 *    through every other check, including the rate limiter.
 */
export function checkRequestOrigin(
  headers: IncomingHttpHeaders,
  allowedOrigins: ReadonlySet<string>
): OriginDecision {
  const secFetchSite = header(headers, "sec-fetch-site")
    ?.trim()
    .toLowerCase();
  if (secFetchSite === "cross-site") {
    return { allowed: false, reason: "cross-site-fetch-metadata" };
  }
  const origin = header(headers, "origin");
  if (origin) {
    const canonical = canonicalOrigin(origin);
    // Malformed values (including the literal "null" origin) fail closed —
    // they can never match the allowlist.
    if (!canonical || !allowedOrigins.has(canonical)) {
      return { allowed: false, reason: "origin-not-allowed" };
    }
  }
  return { allowed: true };
}

/** Case-insensitive single-value header reader for Node header objects. */
function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Conservative limiter key — faithful port. Default: one fixed bucket key;
 * client-supplied forwarding headers (X-Forwarded-For, X-Real-IP, …) are
 * freely spoofable and NEVER read. `TRUST_PROXY=1` may only be enabled when
 * the proxy OVERWRITES X-Real-IP and the app port is not publicly reachable;
 * a missing header then collapses into one shared "untrusted-direct" bucket.
 */
export function getClientKey(
  headers: IncomingHttpHeaders,
  env: Pick<ApiEnv, "TRUST_PROXY">
): string {
  if (env.TRUST_PROXY === "1") {
    const realIp = header(headers, "x-real-ip")?.trim();
    return realIp ? realIp : "untrusted-direct";
  }
  return "local";
}
