/**
 * Image-proxy URL builder (T04-S2).
 *
 * Rewrites whitelisted remote image URLs to the standalone API's image proxy
 * (`{API_BASE}/v1/images/proxy?src=...`) so browser `fetch` calls no longer
 * trip CORS. The allowlist below is a courtesy filter ONLY — the server-side
 * allowlist enforced by apps/api remains the authoritative guard, and the
 * client never widens it (values come from the shared contracts package).
 *
 * Rules:
 * - No API base URL configured → returned unchanged (the download helper's
 *   open-in-new-tab fallback then handles the attempt honestly).
 * - Already-proxied URLs pass through untouched (no double wrapping).
 * - Only plain `https:` URLs on the exact allowlist are wrapped — no ports,
 *   no user:pass credentials, nothing else.
 * - Every other URL (relative, `http:`, other hosts, data URIs, garbage) is
 *   returned unchanged.
 */

import {
  IMAGE_PROXY_ALLOWED_HOSTS,
  IMAGE_PROXY_PATH,
} from "@wallhaze/contracts";
import { resolveApiBaseUrl } from "./client";

const PROXY_ALLOWED_HOSTS = new Set<string>(IMAGE_PROXY_ALLOWED_HOSTS);

export function toProxiedImageUrl(url: string): string {
  const base = resolveApiBaseUrl();
  if (!base) return url;
  if (url.startsWith(IMAGE_PROXY_PATH)) return url;
  if (url.startsWith(`${base}${IMAGE_PROXY_PATH}`)) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== "https:") return url;
  if (!PROXY_ALLOWED_HOSTS.has(parsed.hostname)) return url;
  if (parsed.port !== "") return url;
  if (parsed.username !== "" || parsed.password !== "") return url;
  return `${base}${IMAGE_PROXY_PATH}?src=${encodeURIComponent(url)}`;
}
