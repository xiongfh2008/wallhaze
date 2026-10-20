/**
 * Generation contract (T04-S2 — corrected against the REAL legacy route).
 *
 * Field names and constraints mirror `app/api/generate/route.ts`
 * (re-verified 2026-10-20 during the S2 migration):
 * - the client prompt is capped at 800 characters BEFORE the style template
 *   is appended (S1 wrongly said 2000 — fixed here);
 * - prompt, styleId, aspectRatio and sizePresetId are all OPTIONAL: the old
 *   route composes the final prompt from user prompt and/or the style
 *   template, and falls back to the device's preset ratio when no explicit
 *   ratio is sent;
 * - only `device` is mandatory;
 * - the reference image is transported as a base64 data URI under `refImage`
 *   (omitted entirely in text-to-image mode).
 */

export const PROMPT_MAX_LENGTH = 800;

export const DEVICE_IDS = ["phone", "tablet", "desktop"] as const;
export type DeviceId = (typeof DEVICE_IDS)[number];

export const ASPECT_RATIO_IDS = ["9:16", "3:4", "1:1", "4:3", "16:9"] as const;
export type AspectRatioId = (typeof ASPECT_RATIO_IDS)[number];

export interface GenerationRequest {
  /**
   * User prompt, up to PROMPT_MAX_LENGTH characters after trimming.
   * Optional when a style (or reference image) is selected — the server
   * composes the final prompt and rejects empty input with 400.
   */
  prompt?: string;
  /** Optional style id; unknown ids are rejected with 400. */
  styleId?: string;
  device: DeviceId;
  /**
   * Optional aspect ratio. Absent/null → the device's preset ratio (exact
   * legacy behavior). Must be allowed for the device and agree with the
   * size preset when both are sent.
   */
  aspectRatio?: AspectRatioId | null;
  /**
   * Optional built-in preset id (see SIZE_PRESETS, e.g. "phone-1080x1920").
   * The server re-resolves the size from shared config — client-supplied
   * dimensions are never trusted.
   */
  sizePresetId?: string | null;
  /**
   * Base64 data URI of the optional reference image (PNG/JPEG/WebP, ≤5 MB
   * decoded, magic bytes verified). Omitted entirely for text-to-image.
   */
  refImage?: string;
}

export interface GenerationResponse {
  /** URL of the generated image. */
  imageUrl: string;
  /** Real output dimensions as reported by the provider, when known. */
  width: number | null;
  height: number | null;
  /** Image MIME type (e.g. "image/png"), when known. */
  contentType: string | null;
}
