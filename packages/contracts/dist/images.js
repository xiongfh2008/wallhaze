/**
 * Image proxy contract (T04-S2).
 *
 * Mirrors the legacy `app/api/image/route.ts` behavior: a GET endpoint that
 * re-serves whitelisted artwork hosts same-origin so browser downloads avoid
 * CORS. The allowlist is enforced SERVER-SIDE only; clients never widen it.
 */
export const IMAGE_PROXY_PATH = "/v1/images/proxy";
/**
 * Exact hosts the proxy accepts as source (no subdomains, no ports, no
 * userinfo). Must mirror the API's ALLOWED_HOSTS.
 */
export const IMAGE_PROXY_ALLOWED_HOSTS = [
    "v3b.fal.media",
    "trae-api-cn.mchost.guru",
];
/** Hosts an allowlisted source may redirect to (each hop re-validated). */
export const IMAGE_PROXY_REDIRECT_HOSTS = ["lf-cdn.trae.com.cn"];
/** MIME types the proxy is willing to re-serve (sniffed, never trusted). */
export const IMAGE_PROXY_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
];
/** Stable legacy client-facing error copies (kept identical for the frontend). */
export const IMAGE_PROXY_ERRORS = {
    invalidSource: "Invalid or disallowed image source.",
    unreachable: "The image source could not be reached.",
    tooLarge: "The image is too large to proxy.",
    unsupported: "The source did not return a supported image.",
};
