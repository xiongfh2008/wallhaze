/**
 * Studio restore handoff (R01, audit P2).
 *
 * My Creations can offer "create again" with the saved prompt/settings.
 * Parameters travel as an ordinary, validated query string — never a
 * reference image (history deliberately does not store it). One-shot
 * restoration uses a dedicated event so the Studio keeps owning its state.
 */

import { ASPECT_RATIOS, type AspectRatioId } from "@/lib/sizes";
import { isHistoryDevice, isRatioAllowedForDevice } from "@/lib/sizes";
import { findSizePreset } from "@/lib/sizes";
import { STUDIO_PROMPT_MAX_LENGTH, resolveStylePreselect } from "./form";

/** Dispatched by StudioStylePreselect once the params are parsed. */
export const STUDIO_RESTORE_EVENT = "wallhaze:studio:restore";

export interface StudioRestoreRequest {
  prompt: string | null;
  styleId: string | null;
  device: "phone" | "tablet" | "desktop" | null;
  ratio: AspectRatioId | null;
  presetId: string | null;
}

/** Validates every incoming query parameter; unknown values degrade to null. */
export function parseStudioRestore(
  searchParams: Pick<URLSearchParams, "get">
): StudioRestoreRequest {
  const rawPrompt = searchParams.get("prompt");
  const prompt =
    typeof rawPrompt === "string" && rawPrompt.trim().length > 0
      ? rawPrompt.slice(0, STUDIO_PROMPT_MAX_LENGTH)
      : null;

  const rawDevice = searchParams.get("device");
  const device = isHistoryDevice(rawDevice) ? rawDevice : null;

  const rawRatio = searchParams.get("ratio");
  const ratioId =
    rawRatio && ASPECT_RATIOS.some((option) => option.id === rawRatio)
      ? (rawRatio as AspectRatioId)
      : null;
  // A ratio the device cannot use is dropped rather than forcing a state
  // combination the UI would never offer.
  const ratio =
    ratioId && (!device || isRatioAllowedForDevice(device, ratioId))
      ? ratioId
      : null;

  const preset = findSizePreset(searchParams.get("preset"));
  const presetId = preset ? preset.id : null;

  return {
    prompt,
    styleId: resolveStylePreselect(searchParams.get("style")),
    device,
    ratio,
    presetId,
  };
}

/** True when at least one restorable parameter is present. */
export function hasRestore(request: StudioRestoreRequest): boolean {
  return Boolean(
    request.prompt || request.styleId || request.device || request.ratio || request.presetId
  );
}

/** Builds the /studio href for "create again" from a history entry. */
export function buildStudioRestoreHref(entry: {
  prompt: string;
  styleId: string | null;
  device: string;
  ratio?: string | null;
  sizePresetId?: string | null;
}): string {
  const params = new URLSearchParams();
  const prompt = entry.prompt.trim();
  if (prompt && prompt.length <= STUDIO_PROMPT_MAX_LENGTH) {
    params.set("prompt", prompt);
  }
  if (entry.styleId) params.set("style", entry.styleId);
  if (isHistoryDevice(entry.device)) {
    params.set("device", entry.device);
    if (
      entry.ratio &&
      ASPECT_RATIOS.some((option) => option.id === entry.ratio) &&
      isRatioAllowedForDevice(entry.device, entry.ratio as AspectRatioId)
    ) {
      params.set("ratio", entry.ratio);
    }
  }
  if (entry.sizePresetId && findSizePreset(entry.sizePresetId)) {
    params.set("preset", entry.sizePresetId);
  }
  const query = params.toString();
  return query ? `/studio?${query}` : "/studio";
}
