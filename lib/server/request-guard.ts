/**
 * Stage 4.4-A request-intake guards for the generation API.
 *
 * Pure Web-API logic (no `next/server` imports) so every check stays
 * unit-testable without a running server. The route handler owns the HTTP
 * responses; these functions only decide.
 *
 * Honest capability notes (do not oversell):
 * - Origin / Fetch Metadata checks are NOT authentication. Any non-browser
 *   client can forge both headers freely. They stop browser-based cross-site
 *   requests; abuse from scripted clients is the rate limiter's job.
 * - Client identification is deliberately conservative: until a trusted
 *   reverse-proxy identity exists, ALL requests share one limiter bucket.
 * - `SITE_URL` is read as an optional production origin. It is never guessed;
 *   while it is unset, unknown production origins are rejected (fail-closed).
 */

/**
 * Local development origins. Hard-coded on purpose — the dev server is known
 * to run on port 3000 and no production domain has been provided yet.
 */
const LOCAL_ALLOWED_ORIGINS: readonly string[] = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

/**
 * Builds the Origin allowlist. `SITE_URL` (optional) may name the future VPS
 * domain — set it in the environment only once it is actually known; missing
 * config means stricter behavior, never looser. An invalid `SITE_URL` is
 * ignored (it can never loosen the allowlist into a wildcard).
 */
function allowedOrigins(): Set<string> {
  const origins = new Set<string>(LOCAL_ALLOWED_ORIGINS);
  const siteUrl = process.env.SITE_URL?.trim();
  if (siteUrl) {
    const canonical = canonicalOrigin(siteUrl);
    if (canonical) origins.add(canonical);
  }
  return origins;
}

/**
 * Parses a candidate origin and returns its canonical form, or null when the
 * value is not a plain scheme://host[:port] origin. Parsing with `new URL`
 * (instead of string matching) makes the comparison immune to casing,
 * default-port and encoding tricks; values carrying a path, query, hash or
 * credentials are not Origins at all and fail closed.
 */
function canonicalOrigin(raw: string): string | null {
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

export interface OriginDecision {
  allowed: boolean;
  /** Rejection reason — for logs only, never surfaced to clients. */
  reason?: "cross-site-fetch-metadata" | "origin-not-allowed";
}

/**
 * Validates the request source.
 *
 * Order (matches the stage 4.4-A design):
 * 1. `Sec-Fetch-Site: cross-site` → reject (browser-asserted, cheapest check).
 * 2. `Origin` present → must be in the allowlist, else reject.
 * 3. `Origin` absent (curl, scripts, same-origin GET navigations) → allow;
 *    such requests still pass through every other check, including the rate
 *    limiter.
 *
 * Note: same-origin POSTs always carry `Origin` in modern browsers, so the
 * real same-origin generator flow is unaffected.
 */
export function checkRequestOrigin(request: Request): OriginDecision {
  const secFetchSite = request.headers
    .get("sec-fetch-site")
    ?.trim()
    .toLowerCase();
  if (secFetchSite === "cross-site") {
    return { allowed: false, reason: "cross-site-fetch-metadata" };
  }
  const origin = request.headers.get("origin");
  if (origin) {
    const canonical = canonicalOrigin(origin);
    // Malformed values (including the literal "null" origin) fail closed —
    // they can never match the allowlist.
    if (!canonical || !allowedOrigins().has(canonical)) {
      return { allowed: false, reason: "origin-not-allowed" };
    }
  }
  return { allowed: true };
}

/**
 * Conservative limiter key.
 *
 * Default (TRUST_PROXY unset): returns one fixed bucket key — client-supplied
 * forwarding headers (`X-Forwarded-For`, `X-Real-IP`, …) are freely spoofable
 * and are NEVER read. A shared bucket is fail-safe: a missing identity must
 * not become an attacker-controlled key.
 *
 * `TRUST_PROXY=1` may only be enabled when BOTH conditions hold:
 *   (a) the reverse proxy OVERWRITES `X-Real-IP` with the real client address
 *       (never appends client-controlled values), and
 *   (b) the application port is not reachable from the public internet
 *       without passing through that proxy.
 * Even then, a missing `X-Real-IP` collapses into one shared
 * "untrusted-direct" bucket rather than trusting anything the client sent.
 */
export function getClientKey(request: Request): string {
  if (process.env.TRUST_PROXY === "1") {
    const realIp = request.headers.get("x-real-ip")?.trim();
    return realIp ? realIp : "untrusted-direct";
  }
  return "local";
}

/**
 * True when the request declares an application/json body. The media type is
 * compared without parameters (`; charset=…` allowed), so legitimate clients
 * pass while cross-site form/text submissions are stopped before any body
 * byte is read.
 */
export function isJsonContentType(request: Request): boolean {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  return mediaType === "application/json";
}

export type JsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; status: 413 | 400; error: string };

const BODY_TOO_LARGE_ERROR =
  "That request is too large — please use a smaller image.";
const BODY_INVALID_ERROR = "Invalid request body.";

/**
 * Reads the request body as JSON while enforcing the ACTUAL byte count —
 * Content-Length is advisory and can be missing or lie (chunked encoding),
 * so the stream itself is capped. Reading stops and the stream is cancelled
 * as soon as the limit is exceeded; nothing is read beyond `maxBytes`.
 *
 * UTF-8 decoding is strict (fatal), and empty/malformed payloads are 400 —
 * this happens BEFORE any business validation, always before the upstream
 * call. The returned `body` is an unvalidated `unknown`; the caller applies
 * its existing `GenerateRequestBody` validation unchanged.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number
): Promise<JsonBodyResult> {
  const reader = request.body?.getReader();
  if (!reader) {
    return { ok: false, status: 400, error: BODY_INVALID_ERROR };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // Stop immediately and release the stream — never read past the cap.
      await reader.cancel().catch(() => undefined);
      return { ok: false, status: 413, error: BODY_TOO_LARGE_ERROR };
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(merged);
  } catch {
    return { ok: false, status: 400, error: BODY_INVALID_ERROR };
  }
  try {
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    // Includes the empty-body case: JSON.parse("") throws.
    return { ok: false, status: 400, error: BODY_INVALID_ERROR };
  }
}
