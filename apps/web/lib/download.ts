/**
 * Reusable image download helper.
 *
 * Strategy: fetch the image as a Blob and trigger the download via a
 * temporary object URL, so the file name is controlled by this app instead
 * of the CDN. Remote artwork hosts block cross-origin fetches with CORS,
 * so whitelisted URLs can first be rewritten to the standalone API's image
 * proxy (apps/api, `/v1/images/proxy`) — the browser then fetches through
 * the API origin and the download works without any CORS round-trip.
 * When fetching still fails (proxy not configured, network error,
 * non-whitelisted host) the helper falls back to opening the ORIGINAL URL
 * in a new tab and reports exactly what happened — "opened" must never be
 * presented to the user as "downloaded".
 *
 * T04-S1 note: the web app no longer owns an /api/image route. Proxying is
 * only active when NEXT_PUBLIC_API_BASE_URL points at a backend that
 * implements the proxy route; otherwise remote URLs fall through to the
 * open-in-new-tab fallback. Local gallery images are same-origin and always
 * download directly.
 */

export type DownloadResult = "downloaded" | "opened" | "failed";

/** Whitelist — extensions are only ever derived from known image MIME types. */
const KNOWN_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Maps a MIME type to a safe file extension, or null when unknown. */
function extensionForMime(mime: string | null | undefined): string | null {
  if (!mime) return null;
  const base = mime.split(";")[0].trim().toLowerCase();
  return KNOWN_IMAGE_EXTENSIONS[base] ?? null;
}

/**
 * Local-time "YYYYMMDD-HHMMSS" stamp for readable download file names.
 * The timezone only affects the cosmetic name, never the download itself.
 */
export function timestampedBaseName(
  prefix: string,
  date: Date = new Date()
): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${prefix}-${y}${mo}${day}-${hh}${mm}${ss}`;
}

/* ---- Image proxy (standalone API) ---- */

// The proxy URL builder moved to the unified API client in T04-S2 (single
// source for allowlist + base URL + path). Re-exported for compatibility
// with existing imports.
import { toProxiedImageUrl } from "./api/images";
export { toProxiedImageUrl };

interface DownloadImageOptions {
  /** Remote image URL. Only used for fetching — never as a file name. */
  url: string;
  /** File name WITHOUT extension, e.g. "wallhaze-wallpaper-20261014-093045". */
  baseName: string;
  /**
   * MIME hint (e.g. the API's contentType) used only when the fetched Blob
   * reports no usable type. The extension always comes from a whitelist.
   */
  fallbackMime?: string | null;
}

/**
 * Downloads the image behind {@link url}. Never throws: the returned
 * {@link DownloadResult} distinguishes a real download, a fallback open,
 * and a complete failure.
 */
export async function downloadImage({
  url,
  baseName,
  fallbackMime,
}: DownloadImageOptions): Promise<DownloadResult> {
  try {
    // Whitelisted remote URLs are re-served through the API's proxy when
    // configured; any other URL passes through unchanged. Either way a
    // failure here falls through to the ORIGINAL-url open-image fallback.
    const response = await fetch(toProxiedImageUrl(url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    // Actual Blob MIME first, API hint second, PNG as the final fallback.
    const extension =
      extensionForMime(blob.type) ?? extensionForMime(fallbackMime) ?? "png";
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${baseName}.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoke on a delay — revoking synchronously can cancel the download in
    // Firefox/Safari before it reaches the download manager. Guarded so a
    // late revoke can never surface as an uncaught error.
    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Already revoked or invalid — nothing left to clean up.
      }
    }, 1_000);
    return "downloaded";
  } catch {
    // HTTP error, network failure or a CORS-blocked fetch (e.g. TypeError:
    // "Failed to fetch") — fall back to opening the original image. Direct
    // navigation is not subject to the same CORS policy as fetch. The
    // fallback itself is guarded so this function NEVER rejects: a popup
    // error must not become an unhandled promise rejection.
    try {
      // "noopener" is NOT passed: per the HTML spec that combination always
      // returns null, which made every fallback look like a failure. The
      // opener link is severed explicitly below instead — same isolation,
      // but the return value can actually be inspected.
      const opened = window.open(url, "_blank");
      if (opened) {
        opened.opener = null;
        return "opened";
      }
      // null means the browser blocked the popup (async work loses user
      // activation) — report it as a real failure, never as a success.
      return "failed";
    } catch {
      return "failed";
    }
  }
}

/* ---- Per-item in-flight tracking ----
   Immutable helpers for components that show a busy state on individual
   cards (gallery / favorites) — one item downloading never disables the
   others. */

export function markDownloading(
  ids: ReadonlySet<string>,
  id: string
): ReadonlySet<string> {
  if (ids.has(id)) return ids;
  const next = new Set(ids);
  next.add(id);
  return next;
}

export function markDownloadFinished(
  ids: ReadonlySet<string>,
  id: string
): ReadonlySet<string> {
  if (!ids.has(id)) return ids;
  const next = new Set(ids);
  next.delete(id);
  return next;
}
