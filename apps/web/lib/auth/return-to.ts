/**
 * Post-login return paths.
 *
 * Only same-site relative paths are accepted; absolute URLs, protocol-relative
 * paths, auth pages and control characters fall back to /account. The same
 * rule as the API's returnTo check, applied on the client before building a
 * link — the API remains the authority for the OAuth redirect.
 */

const FALLBACK = "/account";

export function safeNextPath(
  raw: string | null | undefined,
  fallback: string = FALLBACK
): string {
  if (!raw) return fallback;
  if (raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  if (raw === "/login" || raw.startsWith("/login?") || raw.startsWith("/login/")) {
    return fallback;
  }
  if (raw === "/signup" || raw.startsWith("/signup?")) return fallback;
  return raw;
}

/** Builds a login URL carrying the page to return to after authentication. */
export function loginHref(next: string): string {
  const path = safeNextPath(next, "");
  return path ? `/login?next=${encodeURIComponent(path)}` : "/login";
}

/** Prefixes a locale-less web path for the current locale (en is prefix-less). */
export function localizePath(locale: string, path: string): string {
  const safe = safeNextPath(path);
  if (locale === "en") return safe;
  if (safe === `/${locale}` || safe.startsWith(`/${locale}/`)) return safe;
  return `/${locale}${safe}`;
}
