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
export const DEVICE_IDS = ["phone", "tablet", "desktop"];
export const ASPECT_RATIO_IDS = ["9:16", "3:4", "1:1", "4:3", "16:9"];
/** Media kinds supported by the unified generation job pipeline. */
export const MEDIA_TYPES = ["image", "video"];
/**
 * Generation modes share one job/worker/wallet pipeline. `image_edit` is the
 * existing reference-image image flow; the video modes are new.
 */
export const GENERATION_MODES = [
    "text_to_image",
    "image_edit",
    "text_to_video",
    "image_to_video",
];
/** Product video durations. A provider may expose a subset of these. */
export const VIDEO_DURATION_SECONDS = [3, 4, 5];
