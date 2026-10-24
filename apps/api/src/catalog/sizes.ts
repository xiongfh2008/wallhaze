/**
 * Shared device + aspect-ratio configuration for the generator UI and the
 * server-side generation API. Single source of truth — neither side may
 * hardcode device→image_size mappings anymore.
 *
 * The `image_size` values are the official fal.ai enum for
 * fal-ai/flux-2/klein/4b (documented default "landscape_4_3"; enums:
 * square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3,
 * landscape_16_9). The API also accepts custom {width,height} objects —
 * confirmed on both official schema pages — but their min/max/multiple
 * constraints are NOT documented for klein 4b. Enum values remain the
 * model default; the built-in size presets below use conservative custom
 * {width,height} objects (≤ MAX_PRESET_DIMENSION per side) that match a
 * supported ratio exactly. No 21:9, 16:10 or free-form sizes.
 */

/** Mirrors the generator's device selection ("phone" | "tablet" | "desktop"). */
export type HistoryDevice = "phone" | "tablet" | "desktop";

export type AspectRatioId = "9:16" | "3:4" | "1:1" | "4:3" | "16:9";

export interface AspectRatioOption {
  id: AspectRatioId;
  /** Display label, e.g. "9:16". */
  label: string;
  /** width / height — drives the preview frame shape. */
  value: number;
  /** Official fal.ai `image_size` enum value for this ratio. */
  falImageSize: string;
}

export const ASPECT_RATIOS: readonly AspectRatioOption[] = [
  { id: "9:16", label: "9:16", value: 9 / 16, falImageSize: "portrait_16_9" },
  { id: "3:4", label: "3:4", value: 3 / 4, falImageSize: "portrait_4_3" },
  // square_hd chosen over square for wallpaper clarity. The two enums differ
  // in output resolution (and therefore cost), but the exact pixels and the
  // price difference are NOT verified against the current model yet.
  { id: "1:1", label: "1:1", value: 1, falImageSize: "square_hd" },
  { id: "4:3", label: "4:3", value: 4 / 3, falImageSize: "landscape_4_3" },
  { id: "16:9", label: "16:9", value: 16 / 9, falImageSize: "landscape_16_9" },
];

/** Default ratio per device — also the fallback for records without one. */
export const DEVICE_PRESET_RATIO: Record<HistoryDevice, AspectRatioId> = {
  phone: "9:16",
  tablet: "3:4",
  desktop: "16:9",
};

/**
 * Ratios each device may use. The UI only offers these; the API rejects any
 * other combination with a 400 instead of silently falling back.
 */
export const DEVICE_ALLOWED_RATIOS: Record<
  HistoryDevice,
  readonly AspectRatioId[]
> = {
  phone: ["9:16", "3:4", "1:1"],
  tablet: ["3:4", "9:16", "1:1", "4:3", "16:9"],
  desktop: ["16:9", "4:3", "1:1"],
};

const DEVICE_IDS: readonly HistoryDevice[] = ["phone", "tablet", "desktop"];

const RATIO_BY_ID = new Map<string, AspectRatioOption>(
  ASPECT_RATIOS.map((ratio) => [ratio.id, ratio])
);

/** True when `value` is a known device id. */
export function isHistoryDevice(value: unknown): value is HistoryDevice {
  return (
    typeof value === "string" &&
    (DEVICE_IDS as readonly string[]).includes(value)
  );
}

/** True when `value` is a known aspect-ratio id. */
export function isAspectRatioId(value: unknown): value is AspectRatioId {
  return typeof value === "string" && RATIO_BY_ID.has(value);
}

/** True when `ratio` is one of the ratios `device` may use. */
export function isRatioAllowedForDevice(
  device: HistoryDevice,
  ratio: AspectRatioId
): boolean {
  return DEVICE_ALLOWED_RATIOS[device].includes(ratio);
}

/**
 * Resolves the fal.ai `image_size` enum for a device (+ optional ratio).
 * Without a ratio (or with an unknown one) the device's preset ratio is
 * used — exactly the mapping the API applied before aspect ratios existed,
 * so legacy requests keep their previous behavior. Request-level validation
 * (unknown ratio, ratio not allowed for the device) happens upstream in the
 * API route and returns a 400; this function never substitutes silently on
 * behalf of an invalid-but-explicit choice.
 */
export function resolveImageSize(
  device: HistoryDevice,
  ratio?: unknown
): string | null {
  const ratioId = isAspectRatioId(ratio)
    ? ratio
    : DEVICE_PRESET_RATIO[device];
  return RATIO_BY_ID.get(ratioId)?.falImageSize ?? null;
}

/* ---- Resolution presets ----
   Conservative, ratio-exact wallpaper sizes. fal.ai's official schema
   confirms custom {width,height} objects, but does not document klein 4b
   min/max/multiple limits — so every preset stays within
   MAX_PRESET_DIMENSION and no free-form input is exposed. Width × height
   must satisfy matchesRatioExactly() for the preset's ratio. */

/**
 * Hard cap on any preset side until klein 4b's real custom-size limits are
 * verified. The server re-checks every preset against this bound — the UI
 * alone is never the safety net.
 */
export const MAX_PRESET_DIMENSION = 2048;

export interface SizePreset {
  /** Stable id — persisted in history/favorites and sent to the API. */
  id: string;
  device: HistoryDevice;
  /** Output width in pixels. */
  width: number;
  /** Output height in pixels. */
  height: number;
  /** Supported ratio this preset matches exactly. */
  ratio: AspectRatioId;
  /** User-facing name, e.g. "Phone Portrait HD". */
  label: string;
  /**
   * Marks the device's default preset — the fallback when no specific
   * preset is chosen (or when switching devices leaves none to keep).
   */
  recommended?: boolean;
}

/**
 * One preset per allowed device × ratio combination (plus desktop's two
 * 4:3 classics). Every entry's width/height satisfies
 * matchesRatioExactly() against its ratio and never exceeds
 * MAX_PRESET_DIMENSION — enforced by tests, re-checked server-side.
 */
export const SIZE_PRESETS: readonly SizePreset[] = [
  // Phone — portrait-first
  { id: "phone-1080x1920", device: "phone", width: 1080, height: 1920, ratio: "9:16", label: "Phone Portrait HD", recommended: true },
  { id: "phone-1020x1360", device: "phone", width: 1020, height: 1360, ratio: "3:4", label: "Portrait Classic" },
  { id: "phone-1024x1024", device: "phone", width: 1024, height: 1024, ratio: "1:1", label: "Square" },
  // Tablet — all five ratios
  { id: "tablet-1080x1920", device: "tablet", width: 1080, height: 1920, ratio: "9:16", label: "Portrait HD" },
  { id: "tablet-1020x1360", device: "tablet", width: 1020, height: 1360, ratio: "3:4", label: "Portrait Classic", recommended: true },
  { id: "tablet-1024x1024", device: "tablet", width: 1024, height: 1024, ratio: "1:1", label: "Square" },
  { id: "tablet-1440x1080", device: "tablet", width: 1440, height: 1080, ratio: "4:3", label: "Landscape Classic" },
  { id: "tablet-1920x1080", device: "tablet", width: 1920, height: 1080, ratio: "16:9", label: "Landscape HD" },
  // Desktop — landscape-first
  { id: "desktop-1920x1080", device: "desktop", width: 1920, height: 1080, ratio: "16:9", label: "Desktop Full HD", recommended: true },
  { id: "desktop-1600x1200", device: "desktop", width: 1600, height: 1200, ratio: "4:3", label: "Landscape Classic" },
  { id: "desktop-1440x1080", device: "desktop", width: 1440, height: 1080, ratio: "4:3", label: "Landscape Compact" },
  { id: "desktop-1024x1024", device: "desktop", width: 1024, height: 1024, ratio: "1:1", label: "Square" },
];

/** Integer ratio parts per id — exact width/height matching, no float drift. */
const RATIO_PARTS: Record<AspectRatioId, readonly [number, number]> = {
  "9:16": [9, 16],
  "3:4": [3, 4],
  "1:1": [1, 1],
  "4:3": [4, 3],
  "16:9": [16, 9],
};

const PRESET_BY_ID = new Map<string, SizePreset>(
  SIZE_PRESETS.map((preset) => [preset.id, preset])
);

/** True when `value` is a known preset id (string). */
export function isSizePresetId(value: unknown): value is string {
  return typeof value === "string" && PRESET_BY_ID.has(value);
}

/** Looks up a preset by id; null for unknown/non-string ids. */
export function findSizePreset(id: unknown): SizePreset | null {
  return isSizePresetId(id) ? PRESET_BY_ID.get(id) ?? null : null;
}

/** All presets for a device, in declaration order. */
export function getSizePresetsForDevice(
  device: HistoryDevice
): SizePreset[] {
  return SIZE_PRESETS.filter((preset) => preset.device === device);
}

/** Presets for a device + ratio pair (UI shows only these). */
export function getSizePresetsForRatio(
  device: HistoryDevice,
  ratio: AspectRatioId
): SizePreset[] {
  return SIZE_PRESETS.filter(
    (preset) => preset.device === device && preset.ratio === ratio
  );
}

/**
 * The device's fallback preset for a ratio: the recommended one when it
 * matches, otherwise the first preset for that ratio. Null when the device
 * has no preset for the ratio (callers fall back to the model default).
 */
export function getDefaultSizePresetForRatio(
  device: HistoryDevice,
  ratio: AspectRatioId
): SizePreset | null {
  const presets = getSizePresetsForRatio(device, ratio);
  if (presets.length === 0) return null;
  return presets.find((preset) => preset.recommended) ?? presets[0];
}

/** The device's overall default preset (its recommended entry). */
export function getDefaultSizePreset(
  device: HistoryDevice
): SizePreset | null {
  return getSizePresetsForDevice(device).find((p) => p.recommended) ?? null;
}

/** True when width/height match the ratio exactly (integer cross-multiply). */
export function matchesRatioExactly(
  width: number,
  height: number,
  ratio: AspectRatioId
): boolean {
  const [rw, rh] = RATIO_PARTS[ratio];
  return width * rh === height * rw;
}

/**
 * Server-side guard mirroring the UI's conservative bound: positive integers
 * within MAX_PRESET_DIMENSION on both sides.
 */
export function isValidPresetDimensions(
  width: unknown,
  height: unknown
): boolean {
  const isSide = (value: unknown) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_PRESET_DIMENSION;
  return isSide(width) && isSide(height);
}

/* ---- Screen-based recommendation (client only) ----
   Reads window.screen / devicePixelRatio in the browser and maps the
   screen's aspect ratio onto the existing preset list. Never sends screen
   data anywhere and never auto-applies — the UI offers the result and the
   user decides. */

/** Relative difference under which a screen ratio "matches" a supported one. */
export const SCREEN_RATIO_MATCH_TOLERANCE = 0.08;

export interface ScreenPresetRecommendation {
  /** Preset to apply — always belongs to the requested target device. */
  preset: SizePreset;
  /**
   * False when no supported ratio is within the tolerance of the screen's
   * ratio: a general-purpose (device default) preset is suggested instead.
   */
  exactMatch: boolean;
  /** Screen logical size, for display only. */
  screenWidth: number;
  screenHeight: number;
}

/**
 * Maps a screen's aspect ratio (and, when available, pixel density) onto
 * the presets of `targetDevice`. Pure and testable — callers own all DOM
 * access. Screen dimensions are only used for picking among presets;
 * they are never turned into a custom API size.
 */
export function recommendPresetForScreen(
  screenWidth: number,
  screenHeight: number,
  targetDevice: HistoryDevice,
  pixelRatio?: number
): ScreenPresetRecommendation | null {
  if (
    !Number.isFinite(screenWidth) ||
    !Number.isFinite(screenHeight) ||
    screenWidth <= 0 ||
    screenHeight <= 0
  ) {
    return null;
  }

  const long = Math.max(screenWidth, screenHeight);
  const short = Math.min(screenWidth, screenHeight);
  const screenRatio = long / short;
  const portrait = screenHeight > screenWidth;
  const square = screenWidth === screenHeight;

  // Orientation-aware candidates; 1:1 always stays in the running.
  const orientationIds: readonly AspectRatioId[] = square
    ? ["1:1"]
    : portrait
      ? ["9:16", "3:4"]
      : ["4:3", "16:9"];
  const candidateIds: readonly AspectRatioId[] = square
    ? orientationIds
    : [...orientationIds, "1:1"];

  // Closest supported ratio within the tolerance (relative difference).
  let bestRatio: AspectRatioId | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const id of candidateIds) {
    const [rw, rh] = RATIO_PARTS[id];
    const candidateRatio = Math.max(rw, rh) / Math.min(rw, rh);
    const diff = Math.abs(screenRatio - candidateRatio) / candidateRatio;
    if (diff <= SCREEN_RATIO_MATCH_TOLERANCE && diff < bestDiff) {
      bestDiff = diff;
      bestRatio = id;
    }
  }

  if (bestRatio === null) {
    // No precise match — suggest the device's general-purpose default.
    const fallback = getDefaultSizePreset(targetDevice);
    return fallback
      ? { preset: fallback, exactMatch: false, screenWidth, screenHeight }
      : null;
  }

  const presets = getSizePresetsForRatio(targetDevice, bestRatio);
  if (presets.length === 0) {
    // Defensive: the preset matrix covers every device × allowed ratio.
    const fallback = getDefaultSizePreset(targetDevice);
    return fallback
      ? { preset: fallback, exactMatch: false, screenWidth, screenHeight }
      : null;
  }

  // Several presets share the ratio (desktop 4:3): pick the one whose area
  // is closest to the screen's physical pixels when a sane pixelRatio is
  // available — otherwise the recommended entry. Selection stays inside the
  // preset list; screen values never reach the API.
  let chosen = presets.find((preset) => preset.recommended) ?? presets[0];
  if (
    presets.length > 1 &&
    typeof pixelRatio === "number" &&
    Number.isFinite(pixelRatio) &&
    pixelRatio > 0
  ) {
    const targetArea = screenWidth * pixelRatio * (screenHeight * pixelRatio);
    chosen = presets.reduce((a, b) =>
      Math.abs(a.width * a.height - targetArea) <=
      Math.abs(b.width * b.height - targetArea)
        ? a
        : b
    );
  }
  return { preset: chosen, exactMatch: true, screenWidth, screenHeight };
}

/* ---- Custom output sizes ----
   The model schema confirms custom {width,height} objects but does not
   document its pixel limits. These conservative bounds are mirrored by the
   web UI (packages/contracts) and re-checked here — the client is never the
   safety net. Pricing is unchanged: one generation costs the same Credits. */

export const MIN_CUSTOM_DIMENSION = 512;
export const MAX_CUSTOM_DIMENSION = 2048;
export const CUSTOM_DIMENSION_STEP = 4;
export const MAX_CUSTOM_AREA = MAX_CUSTOM_DIMENSION * MAX_CUSTOM_DIMENSION;

export type CustomSizeCheck =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: "not-integer" | "out-of-range" | "step" | "area" };

/** Validates a custom output size against the shared conservative bounds. */
export function validateCustomSize(width: unknown, height: unknown): CustomSizeCheck {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isInteger(width) ||
    !Number.isInteger(height)
  ) {
    return { ok: false, reason: "not-integer" };
  }
  if (
    width < MIN_CUSTOM_DIMENSION ||
    height < MIN_CUSTOM_DIMENSION ||
    width > MAX_CUSTOM_DIMENSION ||
    height > MAX_CUSTOM_DIMENSION
  ) {
    return { ok: false, reason: "out-of-range" };
  }
  if (width % CUSTOM_DIMENSION_STEP !== 0 || height % CUSTOM_DIMENSION_STEP !== 0) {
    return { ok: false, reason: "step" };
  }
  if (width * height > MAX_CUSTOM_AREA) {
    return { ok: false, reason: "area" };
  }
  return { ok: true, width, height };
}
