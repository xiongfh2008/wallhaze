/**
 * Custom output size input handling (client).
 *
 * Bounds mirror the server validator; the server re-checks everything.
 * A custom size is only submitted when it passes here — the UI never claims
 * a size the API would reject.
 */

import {
  CUSTOM_DIMENSION_STEP,
  MAX_CUSTOM_AREA,
  MAX_CUSTOM_DIMENSION,
  MIN_CUSTOM_DIMENSION,
} from "@wallhaze/contracts";

export type CustomSizeError =
  | "required"
  | "invalid"
  | "range"
  | "step"
  | "area";

export type CustomSizeResult =
  | { ok: true; width: number; height: number; ratioLabel: string }
  | { ok: false; error: CustomSizeError };

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Simplified "W:H" label for an arbitrary size. */
export function ratioLabel(width: number, height: number): string {
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

/** Parses the two text inputs; strict, no silent rounding. */
export function parseCustomSize(
  widthText: string,
  heightText: string
): CustomSizeResult {
  const widthRaw = widthText.trim();
  const heightRaw = heightText.trim();
  if (!widthRaw || !heightRaw) return { ok: false, error: "required" };
  if (!/^\d+$/.test(widthRaw) || !/^\d+$/.test(heightRaw)) {
    return { ok: false, error: "invalid" };
  }
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  if (
    width < MIN_CUSTOM_DIMENSION ||
    height < MIN_CUSTOM_DIMENSION ||
    width > MAX_CUSTOM_DIMENSION ||
    height > MAX_CUSTOM_DIMENSION
  ) {
    return { ok: false, error: "range" };
  }
  if (
    width % CUSTOM_DIMENSION_STEP !== 0 ||
    height % CUSTOM_DIMENSION_STEP !== 0
  ) {
    return { ok: false, error: "step" };
  }
  if (width * height > MAX_CUSTOM_AREA) {
    return { ok: false, error: "area" };
  }
  return { ok: true, width, height, ratioLabel: ratioLabel(width, height) };
}

/** Swaps width and height while keeping both text fields valid. */
export function swapSizeText(
  widthText: string,
  heightText: string
): { widthText: string; heightText: string } {
  return { widthText: heightText, heightText: widthText };
}
