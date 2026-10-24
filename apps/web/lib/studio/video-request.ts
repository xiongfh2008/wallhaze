import type {
  VideoDurationSeconds,
  VideoGenerationRequest,
} from "@wallhaze/contracts";
import type { AspectRatioId, HistoryDevice } from "@/lib/sizes";

export interface VideoRequestInput {
  prompt: string;
  motionPrompt: string;
  styleId: string | null;
  device: HistoryDevice;
  ratio: AspectRatioId;
  durationSeconds: VideoDurationSeconds;
  sourceCreationId: string | null;
  refImageUrl: string | null;
}

/** Builds the body for POST /v1/generations/jobs (no price is ever client-set). */
export function buildVideoGenerationRequest(
  input: VideoRequestInput
): VideoGenerationRequest {
  const generationMode = input.sourceCreationId || input.refImageUrl
    ? "image_to_video"
    : "text_to_video";
  return {
    mediaType: "video",
    generationMode,
    ...(input.prompt.trim() ? { prompt: input.prompt.trim() } : {}),
    ...(input.motionPrompt.trim() ? { motionPrompt: input.motionPrompt.trim() } : {}),
    ...(input.styleId ? { styleId: input.styleId } : {}),
    device: input.device,
    aspectRatio: input.ratio,
    durationSeconds: input.durationSeconds,
    ...(input.sourceCreationId
      ? { sourceCreationId: input.sourceCreationId }
      : {}),
    ...(input.sourceCreationId || !input.refImageUrl
      ? {}
      : { refImage: input.refImageUrl }),
  };
}
