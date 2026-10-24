import type { AspectRatioId, HistoryDevice } from "@/lib/sizes";
import type { DeviceProfile } from "@/lib/studio/device";

/** Device classes used by gallery filters, badges and adaptive previews. */
export type DeviceCategory = HistoryDevice;
export type MediaKind = "image" | "video";

export interface MediaDimensions {
  width: number;
  height: number;
}

const STANDARD_RATIOS: readonly { label: string; value: number; id: AspectRatioId }[] = [
  { id: "9:16", label: "9:16", value: 9 / 16 },
  { id: "3:4", label: "3:4", value: 3 / 4 },
  { id: "1:1", label: "1:1", value: 1 },
  { id: "4:3", label: "4:3", value: 4 / 3 },
  { id: "16:9", label: "16:9", value: 16 / 9 },
];

/** True for positive, finite media dimensions. */
export function hasValidDimensions(
  width: unknown,
  height: unknown
): width is number {
  return (
    typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0
  );
}

/** Raw width / height; callers must validate first. */
export function aspectRatioValue(width: number, height: number): number {
  return width / height;
}

/**
 * Nearest standard wallpaper ratio within 4%; otherwise a decimal fallback.
 * Used only for display — actual width/height remain authoritative.
 */
export function formatAspectRatio(width: number, height: number): string {
  if (!hasValidDimensions(width, height)) return "—";
  const value = width / height;
  let best = STANDARD_RATIOS[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const ratio of STANDARD_RATIOS) {
    const diff = Math.abs(value - ratio.value) / ratio.value;
    if (diff < bestDiff) {
      best = ratio;
      bestDiff = diff;
    }
  }
  if (bestDiff <= 0.04) return best.label;
  return value >= 1
    ? `${value.toFixed(2)}:1`
    : `1:${(1 / value).toFixed(2)}`;
}

/**
 * Native device class derived from the ACTUAL file dimensions. This is not a
 * claim that the image can be installed on every device; a portrait 9:16
 * asset is native-phone, a 16:9 asset native-desktop, a 3:4/square asset
 * native-tablet. Crop/pad variants are never inferred.
 */
export function nativeDeviceFor(width: number, height: number): DeviceCategory {
  const value = width / height;
  if (value <= 0.65) return "phone";
  if (value <= 1.12) return "tablet";
  return "desktop";
}

export function nativeDevicesFor(width: number, height: number): DeviceCategory[] {
  return hasValidDimensions(width, height) ? [nativeDeviceFor(width, height)] : [];
}

/** True when a media file's native class matches the filter. */
export function isNativeForDevice(
  width: number,
  height: number,
  device: DeviceCategory
): boolean {
  return nativeDeviceFor(width, height) === device;
}

/** Stable sort: matching native media first, existing order otherwise. */
export function sortMediaForPreferredDevice<T extends MediaDimensions>(
  items: readonly T[],
  device: DeviceCategory | null
): T[] {
  if (!device) return [...items];
  return [...items].sort((a, b) => {
    const aMatch = isNativeForDevice(a.width, a.height, device) ? 0 : 1;
    const bMatch = isNativeForDevice(b.width, b.height, device) ? 0 : 1;
    return aMatch - bMatch;
  });
}

function closestRatio(
  profile: DeviceProfile,
  supported: readonly AspectRatioId[]
): AspectRatioId {
  const target =
    Math.max(profile.viewport.width, profile.viewport.height) /
    Math.min(profile.viewport.width, profile.viewport.height);
  // Orientation is a stronger signal than a marginal aspect-ratio distance:
  // a portrait tablet should not receive a landscape 16:9 video merely
  // because both supported shapes are equally far from its screen ratio.
  const oriented = supported.filter((ratio) => {
    if (profile.orientation === "portrait") return ratio === "9:16" || ratio === "3:4";
    if (profile.orientation === "landscape") return ratio === "16:9" || ratio === "4:3";
    return ratio === "1:1";
  });
  const candidates = oriented.length > 0 ? oriented : supported;
  let best = candidates[0] ?? "9:16";
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const ratio of candidates) {
    const [w, h] = ratio.split(":").map(Number);
    const value = Math.max(w, h) / Math.min(w, h);
    const diff = Math.abs(target - value) / value;
    if (diff < bestDiff) {
      best = ratio;
      bestDiff = diff;
    }
  }
  return best;
}

/**
 * Video recommendation limited to the provider's actual supported ratios.
 * Uses viewport orientation for tablet (portrait 9:16, landscape 16:9) and
 * never returns a ratio the current Provider does not expose.
 */
export function recommendVideoRatio(
  profile: DeviceProfile,
  supported: readonly AspectRatioId[]
): { device: DeviceCategory; ratio: AspectRatioId; exactMatch: boolean } {
  const ratio = closestRatio(profile, supported);
  const target = Math.max(profile.viewport.width, profile.viewport.height) /
    Math.min(profile.viewport.width, profile.viewport.height);
  const [w, h] = ratio.split(":").map(Number);
  const value = Math.max(w, h) / Math.min(w, h);
  return {
    device: profile.device,
    ratio,
    exactMatch: Math.abs(target - value) / value <= 0.08,
  };
}

export function isDeviceCategory(value: unknown): value is DeviceCategory {
  return value === "phone" || value === "tablet" || value === "desktop";
}

/** Localized device labels are resolved at the component layer. */
export const DEVICE_ORDER: readonly DeviceCategory[] = [
  "phone",
  "tablet",
  "desktop",
];
