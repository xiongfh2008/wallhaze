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
import type { StyleId } from "@/lib/styles";
import { STUDIO_PROMPT_MAX_LENGTH, resolveStylePreselect } from "./form";
import { resolveCreateSimilarVariant } from "@/lib/wallpapers";

/** Dispatched by StudioStylePreselect once the params are parsed. */
export const STUDIO_RESTORE_EVENT = "wallhaze:studio:restore";

/**
 * Structured "Create similar" handoff: wallpaper + variant ids only. The
 * internal template is resolved from the CREATE_SIMILAR_VARIANTS whitelist
 * (never transmitted in the URL, never placed in an editable input) and is
 * merged with the user's own supplement at generation time.
 */
export interface CreateSimilarHandoff {
  wallpaperId: string;
  variantId: string;
  /** Internal template resolved from the whitelist at parse time. */
  prompt: string;
}

export interface StudioRestoreRequest {
  prompt: string | null;
  /** Already resolved through the style catalogue — null means "no style". */
  styleId: StyleId | null;
  device: "phone" | "tablet" | "desktop" | null;
  ratio: AspectRatioId | null;
  presetId: string | null;
  /**
   * "Create similar" handoff: a SAME-ORIGIN public wallpaper path used as
   * the reference image. Strictly a site-internal path — the generator
   * fetches it client-side and converts it to the reference data URI.
   */
  ref: string | null;
  /**
   * Parsed "Create similar" context — non-null only when BOTH the wallpaper
   * slug and the variant id resolve through the whitelist. An invalid pair
   * degrades to null (plain Studio) and must never trigger a generation.
   */
  createSimilar: CreateSimilarHandoff | null;
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

  // Reference image: ONLY site-internal wallpaper paths are accepted, so a
  // hand-edited URL can never make the Studio fetch arbitrary origins.
  const rawRef = searchParams.get("ref");
  const ref =
    typeof rawRef === "string" && rawRef.startsWith("/images/wallpapers/")
      ? rawRef
      : null;

  // "Create similar": structured wallpaper+variant ids. Both must resolve
  // through the CREATE_SIMILAR_VARIANTS whitelist — anything else (unknown
  // slug, unknown variant, missing pair) degrades to null so a hand-edited
  // URL can never smuggle generation text into the Studio.
  const createSimilarVariant = resolveCreateSimilarVariant(
    searchParams.get("wallpaper"),
    searchParams.get("variant")
  );
  const createSimilar: CreateSimilarHandoff | null = createSimilarVariant
    ? {
        wallpaperId: searchParams.get("wallpaper") as string,
        variantId: searchParams.get("variant") as string,
        prompt: createSimilarVariant.prompt,
      }
    : null;

  return {
    prompt,
    styleId: resolveStylePreselect(searchParams.get("style")),
    device,
    ratio,
    presetId,
    ref,
    createSimilar,
  };
}

/** True when at least one restorable parameter is present. */
export function hasRestore(request: StudioRestoreRequest): boolean {
  return Boolean(
    request.prompt ||
      request.styleId ||
      request.device ||
      request.ratio ||
      request.presetId ||
      request.ref ||
      request.createSimilar
  );
}

/** Builds the /studio href for "create again" from a history entry. */
export function buildStudioRestoreHref(entry: {
  prompt: string;
  styleId: string | null;
  device: string;
  ratio?: string | null;
  sizePresetId?: string | null;
  /** Same-origin public wallpaper path used as the reference image. */
  ref?: string | null;
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
  if (
    entry.ref &&
    entry.ref.startsWith("/images/wallpapers/") &&
    entry.ref.length <= 200
  ) {
    params.set("ref", entry.ref);
  }
  const query = params.toString();
  return query ? `/studio?${query}` : "/studio";
}

/**
 * Builds the /studio href for the structured "Create similar" handoff:
 * wallpaper + variant ids, device/ratio and the same-origin reference path.
 * The internal template is NOT included — the Studio resolves it from the
 * whitelist by the ids alone. Returns null for a pair outside the whitelist
 * or an illegal device/ratio combination, so the detail page renders no
 * button rather than a broken handoff.
 */
export function buildCreateSimilarHref(input: {
  wallpaperId: string;
  variantId: string;
  device: string;
  ratio: string | null;
  /** Same-origin public wallpaper path used as the reference image. */
  ref: string;
}): string | null {
  if (!resolveCreateSimilarVariant(input.wallpaperId, input.variantId)) {
    return null;
  }
  if (!isHistoryDevice(input.device)) return null;
  const params = new URLSearchParams();
  params.set("wallpaper", input.wallpaperId);
  params.set("variant", input.variantId);
  params.set("device", input.device);
  if (
    input.ratio &&
    ASPECT_RATIOS.some((option) => option.id === input.ratio) &&
    isRatioAllowedForDevice(input.device, input.ratio as AspectRatioId)
  ) {
    params.set("ratio", input.ratio);
  }
  if (
    input.ref.startsWith("/images/wallpapers/") &&
    input.ref.length <= 200
  ) {
    params.set("ref", input.ref);
  }
  return `/studio?${params.toString()}`;
}
