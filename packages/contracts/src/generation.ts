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

/** Custom output size bounds shared by the web UI and the API validator. */
export const MIN_CUSTOM_DIMENSION = 512;
export const MAX_CUSTOM_DIMENSION = 2048;
/** Custom sides must be multiples of this (conservative model alignment). */
export const CUSTOM_DIMENSION_STEP = 4;
/** Hard cap on width x height for a custom size. */
export const MAX_CUSTOM_AREA = MAX_CUSTOM_DIMENSION * MAX_CUSTOM_DIMENSION;

export const DEVICE_IDS = ["phone", "tablet", "desktop"] as const;
export type DeviceId = (typeof DEVICE_IDS)[number];

export const ASPECT_RATIO_IDS = ["9:16", "3:4", "1:1", "4:3", "16:9"] as const;
export type AspectRatioId = (typeof ASPECT_RATIO_IDS)[number];

/** Media kinds supported by the unified generation job pipeline. */
export const MEDIA_TYPES = ["image", "video"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * Generation modes share one job/worker/wallet pipeline. `image_edit` is the
 * existing reference-image image flow; the video modes are new.
 */
export const GENERATION_MODES = [
  "text_to_image",
  "image_edit",
  "text_to_video",
  "image_to_video",
] as const;
export type GenerationModeId = (typeof GENERATION_MODES)[number];

/** Product video durations. A provider may expose a subset of these. */
export const VIDEO_DURATION_SECONDS = [3, 4, 5] as const;
export type VideoDurationSeconds = (typeof VIDEO_DURATION_SECONDS)[number];

/** Video request for the async job endpoint (never the synchronous image route). */
export interface VideoGenerationRequest {
  mediaType: "video";
  generationMode: "text_to_video" | "image_to_video";
  /** Scene description for text-to-video, optional context for image-to-video. */
  prompt?: string;
  /** Motion instruction. The style's motion guidance is used when omitted. */
  motionPrompt?: string;
  styleId?: string;
  device: DeviceId;
  /**
   * Video aspect ratios are limited by the provider. The backend rejects a
   * ratio that is not in its advertised capability list.
   */
  aspectRatio?: AspectRatioId | null;
  durationSeconds: VideoDurationSeconds;
  /**
   * Existing private image creation to animate (owned by the caller).
   * Mutually exclusive with `refImage`.
   */
  sourceCreationId?: string;
  /** Uploaded source image as a validated base64 data URI (image_to_video). */
  refImage?: string;
}

/** Request accepted by POST /v1/generations/jobs. */
export type GenerationJobRequest = GenerationRequest | VideoGenerationRequest;

/** One video mode's live/mock capabilities, returned by /v1/credits/pricing. */
export interface VideoModePricing {
  durations: VideoDurationSeconds[];
  aspectRatios: AspectRatioId[];
  creditsByDuration: Partial<Record<VideoDurationSeconds, number>>;
  costBoundMicrosByDuration: Partial<Record<VideoDurationSeconds, number>>;
  resolution: string;
  generateAudio: boolean;
  provider: string;
}

export interface VideoPricing {
  available: boolean;
  mock: boolean;
  modes: {
    text_to_video: VideoModePricing;
    image_to_video: VideoModePricing;
  };
}


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
   * Optional custom output size in pixels. When both are set they override
   * the preset/ratio mapping; the API enforces MIN/MAX, step alignment and
   * MAX_CUSTOM_AREA. Mutually exclusive with sizePresetId.
   */
  width?: number;
  height?: number;
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
