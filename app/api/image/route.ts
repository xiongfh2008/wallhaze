import { NextResponse } from "next/server";

/**
 * Same-origin image proxy for whitelisted artwork hosts (fal CDN and the
 * trae-api generator). Browsers block cross-origin fetches with CORS, so
 * download flows will re-serve these images through this route to make them
 * same-origin. Not wired into any component yet — added standalone on
 * purpose.
 *
 * Security posture:
 * - HTTPS-only, exact host allowlist (no subdomains, no ports, no userinfo,
 *   no other URL parts that could smuggle a different origin).
 * - Redirects are followed only under guard: every hop is re-validated
 *   (https-only, exact host in the source-or-redirect allowlist, no ports,
 *   no credentials) so an allowlisted host can never bounce the proxy to an
 *   arbitrary origin.
 * - Response size is capped while streaming — Content-Length alone is not
 *   trusted (it can be missing or lie).
 * - Only real image bytes are re-served: magic bytes are sniffed and the
 *   result must be an allowlisted image type. HTML/JSON/SVG are refused
 *   regardless of what the upstream Content-Type header claims.
 * - Error responses never leak internals, credentials or upstream URLs.
 */

const ALLOWED_HOSTS = new Set(["v3b.fal.media", "trae-api-cn.mchost.guru"]);

/**
 * Hosts an allowlisted source is allowed to redirect to. Real artwork hosts
 * 301 to their CDN (observed: trae-api → lf-cdn.trae.com.cn), so refusing
 * redirects outright made every proxied download fail while <img> tags —
 * which follow redirects transparently — kept working. Every redirect hop
 * is re-validated below (https-only, exact host in the union allowlist, no
 * ports, no credentials), so an allowlisted host can still never bounce the
 * proxy to an arbitrary origin.
 */
const REDIRECT_ALLOWED_HOSTS = new Set(["lf-cdn.trae.com.cn"]);

/** Maximum number of redirect hops followed after the initial request. */
const MAX_REDIRECT_HOPS = 3;

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/** Hard cap on proxied image bytes — wallpapers are far below this. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** Covers connection + headers + full body read (abort also interrupts body). */
const UPSTREAM_TIMEOUT_MS = 20_000;

const FALLBACK_ERROR = "The image source could not be reached.";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Parses and validates the requested source URL. Returns null for anything
 * that is not a plain HTTPS URL on the exact allowlist.
 */
function parseAllowedImageUrl(raw: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;
  // No non-standard ports, no user:pass credentials, no query-less oddities.
  if (url.port !== "") return null;
  if (url.username !== "" || url.password !== "") return null;
  return url;
}

/**
 * MIME sniffed from magic bytes — the upstream Content-Type header is never
 * trusted (it can be missing, wrong or hostile).
 */
function sniffImageMime(bytes: Buffer): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (bytes.length >= 6) {
    const gif = bytes.toString("latin1", 0, 6);
    if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get("src");
  const imageUrl = parseAllowedImageUrl(src);
  if (!imageUrl) {
    return errorResponse("Invalid or disallowed image source.", 400);
  }

  let upstream: Response;
  try {
    // Follow redirects only when every hop lands on a validated https host
    // (the source allowlist plus the curated redirect targets). "manual" is
    // used so each hop can be inspected and re-validated — following blindly
    // would let an allowlisted host forward the proxy to any origin.
    let current: URL = imageUrl;
    let final: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      const response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        headers: { Accept: [...ALLOWED_MIME_TYPES].join(",") },
      });
      if (response.status < 300 || response.status >= 400) {
        final = response;
        break;
      }
      const location = response.headers.get("location");
      if (!location) {
        // A redirect without a target — handled as a failure below.
        final = response;
        break;
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return errorResponse(FALLBACK_ERROR, 502);
      }
      if (
        next.protocol !== "https:" ||
        next.port !== "" ||
        next.username !== "" ||
        next.password !== "" ||
        !(
          ALLOWED_HOSTS.has(next.hostname) ||
          REDIRECT_ALLOWED_HOSTS.has(next.hostname)
        )
      ) {
        // Disallowed redirect target — refuse without echoing where it
        // tried to go.
        return errorResponse(FALLBACK_ERROR, 502);
      }
      current = next;
    }
    if (!final) {
      // Redirect chain exhausted (too many hops).
      return errorResponse(FALLBACK_ERROR, 502);
    }
    upstream = final;
  } catch {
    // Timeout, DNS failure, refused connection — all collapse to one message.
    return errorResponse(FALLBACK_ERROR, 502);
  }

  if (!upstream.ok) {
    return errorResponse(FALLBACK_ERROR, 502);
  }

  // Fast rejection when an honest Content-Length is present; the streaming
  // cap below remains the authoritative guard.
  const declaredLength = Number(upstream.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    return errorResponse("The image is too large to proxy.", 413);
  }

  const reader = upstream.body?.getReader();
  if (!reader) {
    return errorResponse(FALLBACK_ERROR, 502);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => undefined);
        return errorResponse("The image is too large to proxy.", 413);
      }
      chunks.push(value);
    }
  } catch {
    // Mid-body failure or abort while streaming the upstream response.
    return errorResponse(FALLBACK_ERROR, 502);
  }

  if (total === 0) {
    return errorResponse(FALLBACK_ERROR, 502);
  }

  const body = Buffer.concat(chunks);
  const mime = sniffImageMime(body);
  if (!mime || !ALLOWED_MIME_TYPES.has(mime)) {
    return errorResponse("The source did not return a supported image.", 415);
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(total),
      "X-Content-Type-Options": "nosniff",
      // Image URLs on both hosts are immutable — caching is safe and keeps
      // repeat downloads off the upstream entirely.
      "Cache-Control": "public, max-age=86400",
    },
  });
}
