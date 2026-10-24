/**
 * Builds the API generation request from Studio state (pure + tested).
 *
 * Custom sizes are sent as width/height and deliberately omit preset/ratio,
 * so the server does not apply device-ratio rules to an explicit size.
 */

import type { GenerationRequest } from "@wallhaze/contracts";
import type { AspectRatioId, HistoryDevice } from "@/lib/sizes";

export interface GenerationRequestInput {
  prompt: string;
  styleId: string | null;
  device: HistoryDevice;
  ratio: AspectRatioId;
  presetId: string | null;
  customSize: { width: number; height: number } | null;
  refImageUrl: string | null;
}

export function buildGenerationRequest(
  input: GenerationRequestInput
): GenerationRequest {
  const prompt = input.prompt.trim();
  const base: GenerationRequest = {
    ...(prompt ? { prompt } : {}),
    ...(input.styleId ? { styleId: input.styleId } : {}),
    device: input.device,
  };
  const withRef: GenerationRequest = input.refImageUrl
    ? { ...base, refImage: input.refImageUrl }
    : base;
  if (input.customSize) {
    return {
      ...withRef,
      width: input.customSize.width,
      height: input.customSize.height,
    };
  }
  return {
    ...withRef,
    aspectRatio: input.ratio,
    sizePresetId: input.presetId,
  };
}
