/**
 * Device detection and wallpaper-size recommendation (client-only, pure).
 *
 * The browser never tells us the physical panel; we only get CSS pixels plus
 * devicePixelRatio. These functions:
 * - classify the device from viewport width + touch capability (not brands);
 * - estimate physical pixels as CSS size × DPR (an estimate, never claimed
 *   as the device's native resolution);
 * - map the screen's shape onto an EXISTING, server-supported preset and
 *   report whether the match is exact or approximate.
 *
 * No DOM access here; readScreenInfo() is the only browser-touching helper.
 */

import {
  ASPECT_RATIOS,
  DEVICE_ALLOWED_RATIOS,
  DEVICE_PRESET_RATIO,
  findSizePreset,
  getDefaultSizePreset,
  getSizePresetsForRatio,
  type AspectRatioId,
  type HistoryDevice,
  type SizePreset,
} from "@/lib/sizes";

/** Relative difference under which a screen ratio counts as an exact match. */
export const EXACT_RATIO_TOLERANCE = 0.08;

export interface ScreenInfo {
  /** screen.width/height in CSS pixels. */
  screenWidth: number;
  screenHeight: number;
  /** window.innerWidth/innerHeight in CSS pixels. */
  innerWidth: number;
  innerHeight: number;
  pixelRatio: number;
  /** navigator.maxTouchPoints; 0/undefined on desktops without touch. */
  maxTouchPoints?: number;
}

export interface DeviceProfile {
  device: HistoryDevice;
  orientation: "portrait" | "landscape" | "square";
  /** CSS viewport used for classification. */
  viewport: { width: number; height: number };
  /** Estimated physical pixels (screen CSS size × DPR). */
  physical: { width: number; height: number };
  /** Long/short side ratio of the estimated physical screen. */
  screenRatio: number;
}

export interface SizeRecommendation {
  device: HistoryDevice;
  ratio: AspectRatioId;
  preset: SizePreset;
  /** False when no supported ratio is close to the screen's shape. */
  exactMatch: boolean;
  profile: DeviceProfile;
}

function valid(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Classifies the device and estimates physical pixels. Returns null for
 * unusable input (SSR, headless, zero-sized viewports).
 */
export function detectDeviceProfile(input: ScreenInfo): DeviceProfile | null {
  const { screenWidth, screenHeight, innerWidth, innerHeight } = input;
  if (
    !valid(screenWidth) ||
    !valid(screenHeight) ||
    !valid(innerWidth) ||
    !valid(innerHeight)
  ) {
    return null;
  }
  const dpr = valid(input.pixelRatio) ? input.pixelRatio : 1;
  const touch = (input.maxTouchPoints ?? 0) > 0;

  // Touch + narrow viewport = phone/tablet. A touch laptop (wide viewport)
  // is treated as desktop. No touch means a computer, even in a small window.
  let device: HistoryDevice;
  if (!touch || innerWidth >= 1200) device = "desktop";
  else if (innerWidth >= 700) device = "tablet";
  else device = "phone";

  const width = screenWidth;
  const height = screenHeight;
  const orientation =
    width === height ? "square" : height > width ? "portrait" : "landscape";
  const screenRatio = Math.max(width, height) / Math.min(width, height);

  return {
    device,
    orientation,
    viewport: { width: innerWidth, height: innerHeight },
    physical: { width: Math.round(width * dpr), height: Math.round(height * dpr) },
    screenRatio,
  };
}

/**
 * Chooses the closest allowed ratio for the device and the preset whose area
 * is nearest the estimated physical screen. Always returns a supported
 * preset; `exactMatch` tells the UI whether the shape is approximate.
 */
export function recommendWallpaperSize(
  profile: DeviceProfile
): SizeRecommendation {
  const candidates = DEVICE_ALLOWED_RATIOS[profile.device];
  let bestRatio: AspectRatioId = DEVICE_PRESET_RATIO[profile.device];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const ratio of candidates) {
    const [w, h] = ratio.split(":").map(Number);
    const value = Math.max(w, h) / Math.min(w, h);
    const diff = Math.abs(profile.screenRatio - value) / value;
    if (diff < bestDiff) {
      bestDiff = diff;
      bestRatio = ratio;
    }
  }

  const presets = getSizePresetsForRatio(profile.device, bestRatio);
  const fallback = getDefaultSizePreset(profile.device);
  const targetArea = profile.physical.width * profile.physical.height;
  const preset =
    presets.length === 0
      ? fallback
      : presets.reduce((a, b) =>
          Math.abs(a.width * a.height - targetArea) <=
          Math.abs(b.width * b.height - targetArea)
            ? a
            : b
        );

  return {
    device: profile.device,
    ratio: bestRatio,
    // The preset matrix covers every device × allowed ratio; fallback is
    // defensive only.
    preset: preset ?? {
      id: "",
      device: profile.device,
      width: 1080,
      height: 1920,
      ratio: bestRatio,
      label: "",
    },
    exactMatch: bestDiff <= EXACT_RATIO_TOLERANCE,
    profile,
  };
}

/** Reads the browser's screen facts; null outside a browser. */
export function readScreenInfo(): ScreenInfo | null {
  if (typeof window === "undefined") return null;
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return {
    screenWidth: window.screen?.width ?? 0,
    screenHeight: window.screen?.height ?? 0,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio || 1,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
  };
}

/** Convenience: detect + recommend in one call. */
export function autoSelectSize(
  input: ScreenInfo
): SizeRecommendation | null {
  const profile = detectDeviceProfile(input);
  return profile ? recommendWallpaperSize(profile) : null;
}

/* ---- Manual size preference (persisted) ---- */

import type { AspectRatioId as RatioId, HistoryDevice as DeviceId } from "@/lib/sizes";

const SIZE_PREFERENCE_KEY = "wallhaze:studio:size:v1";

export interface SavedSizePreference {
  device: DeviceId;
  ratio: RatioId;
  presetId: string | null;
  custom: { width: number; height: number } | null;
}

/** Reads a previously saved manual size; invalid data is discarded. */
export function readSizePreference(): SavedSizePreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SIZE_PREFERENCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSizePreference>;
    if (
      parsed.device !== "phone" &&
      parsed.device !== "tablet" &&
      parsed.device !== "desktop"
    ) {
      return null;
    }
    if (
      typeof parsed.ratio !== "string" ||
      !ASPECT_RATIOS.some((ratio) => ratio.id === parsed.ratio)
    ) {
      return null;
    }
    const preset = findSizePreset(parsed.presetId);
    if (preset && preset.device !== parsed.device) return null;
    const custom =
      parsed.custom &&
      Number.isInteger(parsed.custom.width) &&
      Number.isInteger(parsed.custom.height)
        ? parsed.custom
        : null;
    return {
      device: parsed.device,
      ratio: parsed.ratio as RatioId,
      presetId: preset ? preset.id : null,
      custom,
    };
  } catch {
    return null;
  }
}

export function saveSizePreference(preference: SavedSizePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SIZE_PREFERENCE_KEY,
      JSON.stringify(preference)
    );
  } catch {
    // Storage unavailable — the choice still applies for this session.
  }
}

export function clearSizePreference(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SIZE_PREFERENCE_KEY);
  } catch {
    // Nothing to clear.
  }
}
