export type { ApiErrorCode, ApiErrorEnvelope } from "./errors";
export type {
  AspectRatioId,
  DeviceId,
  GenerationRequest,
  GenerationResponse,
} from "./generation";
export { ASPECT_RATIO_IDS, DEVICE_IDS, PROMPT_MAX_LENGTH } from "./generation";
export type { GalleryWallpaper } from "./gallery";
export {
  IMAGE_PROXY_ALLOWED_HOSTS,
  IMAGE_PROXY_ERRORS,
  IMAGE_PROXY_MIME_TYPES,
  IMAGE_PROXY_PATH,
  IMAGE_PROXY_REDIRECT_HOSTS,
  type ImageProxyQuery,
} from "./images";

// Future business domains are intentionally placeholders only — they mark
// planned contract surface and MUST NOT be treated as live APIs. See
// src/placeholders.ts.
export type {
  CreditWalletPlaceholder,
  GenerationJobPlaceholder,
  PaymentOrderPlaceholder,
  UserAccountPlaceholder,
} from "./placeholders";
