/**
 * Studio form selection logic (FE04-A) — pure functions over the
 * device/ratio/preset matrix from lib/sizes.ts and the style catalog.
 *
 * Extracted from GeneratorSection so the consistency rules are unit-testable
 * without a DOM: switching devices/ratios must never leave an illegal
 * combination selected, and the server's constraints are mirrored exactly
 * (the API still re-validates everything — these helpers only prevent the
 * obvious 400s).
 */

import { findStyle, type StyleId } from "@/lib/styles";
import {
  DEVICE_PRESET_RATIO,
  findSizePreset,
  getDefaultSizePresetForRatio,
  getSizePresetsForRatio,
  isAspectRatioId,
  isRatioAllowedForDevice,
  type AspectRatioId,
  type HistoryDevice,
  type SizePreset,
} from "@/lib/sizes";

/** One complete, self-consistent form selection. */
export interface StudioFormSelection {
  device: HistoryDevice;
  ratio: AspectRatioId;
  /** Built-in preset id, or null for the model-default size. */
  presetId: string | null;
}

/** True when the selection is legal for the API (ratio allowed, preset
 * belongs to the device+ratio pair). */
export function isFormSelectionValid(selection: StudioFormSelection): boolean {
  if (!isRatioAllowedForDevice(selection.device, selection.ratio)) {
    return false;
  }
  if (selection.presetId === null) return true;
  const preset = findSizePreset(selection.presetId);
  return (
    preset !== null &&
    preset.device === selection.device &&
    preset.ratio === selection.ratio
  );
}

/**
 * Applies a device change: keeps the current ratio when the new device
 * still allows it, otherwise falls back to the new device's preset ratio.
 * The preset follows the resolved ratio (its default for that pair, or
 * model-default when the pair has no preset).
 */
export function applyDeviceChange(
  current: StudioFormSelection,
  nextDevice: HistoryDevice
): StudioFormSelection {
  const ratio = isRatioAllowedForDevice(nextDevice, current.ratio)
    ? current.ratio
    : DEVICE_PRESET_RATIO[nextDevice];
  const presetId = resolvePresetForPair(nextDevice, ratio, current.presetId);
  return { device: nextDevice, ratio, presetId };
}

/**
 * Applies a ratio change within the current device: the preset survives
 * only when it matches the new ratio, otherwise the pair's default preset
 * (or model-default) is selected.
 */
export function applyRatioChange(
  current: StudioFormSelection,
  nextRatio: AspectRatioId
): StudioFormSelection {
  const ratio = isRatioAllowedForDevice(current.device, nextRatio)
    ? nextRatio
    : DEVICE_PRESET_RATIO[current.device];
  const presetId = resolvePresetForPair(current.device, ratio, current.presetId);
  return { device: current.device, ratio, presetId };
}

/** Preset for a device+ratio pair: the current one when still valid,
 * otherwise the pair's default, or null (model default). */
function resolvePresetForPair(
  device: HistoryDevice,
  ratio: AspectRatioId,
  preferredPresetId: string | null
): string | null {
  if (preferredPresetId !== null) {
    const preferred = findSizePreset(preferredPresetId);
    if (
      preferred &&
      preferred.device === device &&
      preferred.ratio === ratio
    ) {
      return preferred.id;
    }
  }
  const fallback: SizePreset | null = getDefaultSizePresetForRatio(
    device,
    ratio
  );
  return fallback ? fallback.id : null;
}

/** The presets a device+ratio pair offers (what the UI may list). */
export function listPresetsForSelection(
  selection: StudioFormSelection
): SizePreset[] {
  return getSizePresetsForRatio(selection.device, selection.ratio);
}

/* ---- Prompt validation ----
   Contract (packages/contracts/src/generation.ts): the client prompt is
   capped at PROMPT_MAX_LENGTH BEFORE the style template is appended, and
   the server composes the final prompt from the user prompt and/or the
   style template — input with NEITHER is rejected with 400. These helpers
   give the UI the same rules for fast feedback. */

export const STUDIO_PROMPT_MAX_LENGTH = 800;

export type PromptValidation =
  | { ok: true }
  | { ok: false; code: "too-long" | "empty"; limit: number };

/**
 * Validates the (prompt, style) pair the way the API would:
 * - over-limit → "too-long" (limit echoed for the i18n message);
 * - empty prompt AND no style → "empty" (nothing to compose from);
 * - empty prompt WITH a style is fine (template-only generation).
 */
export function validatePromptPair(
  prompt: string,
  styleId: StyleId | null
): PromptValidation {
  const limit = STUDIO_PROMPT_MAX_LENGTH;
  if (prompt.length > limit) {
    return { ok: false, code: "too-long", limit };
  }
  if (prompt.trim().length === 0 && styleId === null) {
    return { ok: false, code: "empty", limit };
  }
  return { ok: true };
}

/* ---- Style preselection (?style=<id> deep links) ---- */

/**
 * Normalizes a requested style id from the URL. Unknown/illegal values
 * degrade to null (no preselection) instead of throwing or falling back to
 * an arbitrary style — the studio simply starts unstyled.
 */
export function resolveStylePreselect(
  requested: string | null | undefined
): StyleId | null {
  if (typeof requested !== "string") return null;
  const style = findStyle(requested);
  return style ? style.id : null;
}

/** True when the value is a legal AspectRatioId (re-exported guard for the
 * form components — keeps the sizes import surface in one place). */
export function isValidRatioId(value: unknown): value is AspectRatioId {
  return isAspectRatioId(value);
}
