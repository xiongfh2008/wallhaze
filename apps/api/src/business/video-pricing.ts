import type {
  AspectRatioId,
  VideoDurationSeconds,
  VideoModePricing,
  VideoPricing,
} from "@wallhaze/contracts";
import type { GenerationMode } from "./provider-mode.js";

/**
 * Video pricing and capability matrix (server-owned, like image pricing).
 *
 * Real-provider candidates were checked against their official fal.ai
 * schemas on 2026-10-24:
 * - Wan 2.2-5B I2V: 720p, up to 5s, `aspect_ratio` 9:16 / 16:9 / 1:1,
 *   flat $0.15 per video.
 * - Kling v3 Standard T2V: 3–15s whole seconds, 16:9 / 9:16 / 1:1,
 *   `generate_audio=false`; $0.084/s (5s ≈ $0.42).
 *
 * The first release deliberately exposes only the durations that the chosen
 * adapter declares. I2V stays at 5s (Wan); T2V can offer 3/4/5 (Kling).
 * Cost bounds are conservative and include download/storage/bandwidth:
 * Wan 5s = $0.50, Kling 3/4/5s = $0.50/$0.65/$0.80.
 */
export const VIDEO_ASPECT_RATIOS: readonly AspectRatioId[] = [
  "9:16",
  "16:9",
  "1:1",
];

export const VIDEO_I2V_DURATIONS: readonly VideoDurationSeconds[] = [5];
export const VIDEO_T2V_DURATIONS: readonly VideoDurationSeconds[] = [3, 4, 5];

/** Credits are intentionally much higher than the 10-credit image price. */
export const VIDEO_I2V_CREDITS: Partial<Record<VideoDurationSeconds, number>> = {
  5: 40,
};
export const VIDEO_T2V_CREDITS: Partial<Record<VideoDurationSeconds, number>> = {
  3: 40,
  4: 50,
  5: 60,
};
const VIDEO_I2V_COST: Partial<Record<VideoDurationSeconds, number>> = {
  5: 500_000,
};
const VIDEO_T2V_COST: Partial<Record<VideoDurationSeconds, number>> = {
  3: 500_000,
  4: 650_000,
  5: 800_000,
};

export type VideoGenerationMode = "text_to_video" | "image_to_video";

export function videoModePricing(
  generationMode: VideoGenerationMode,
  runtime: GenerationMode
): VideoModePricing {
  const isMock = runtime === "mock";
  const enabled = runtime !== "disabled";
  if (generationMode === "image_to_video") {
    return {
      durations: enabled ? [...VIDEO_I2V_DURATIONS] : [],
      aspectRatios: enabled ? [...VIDEO_ASPECT_RATIOS] : [],
      creditsByDuration: enabled ? { ...VIDEO_I2V_CREDITS } : {},
      costBoundMicrosByDuration: enabled ? { ...VIDEO_I2V_COST } : {},
      resolution: isMock ? "360p mock preview" : "720p",
      generateAudio: false,
      provider: isMock ? "mock (Wan I2V capability shape)" : "wan-2.2-5b-i2v",
    };
  }
  return {
    durations: enabled ? [...VIDEO_T2V_DURATIONS] : [],
    aspectRatios: enabled ? [...VIDEO_ASPECT_RATIOS] : [],
    creditsByDuration: enabled ? { ...VIDEO_T2V_CREDITS } : {},
    costBoundMicrosByDuration: enabled ? { ...VIDEO_T2V_COST } : {},
    resolution: isMock ? "360p mock preview" : "720p class (provider standard)",
    generateAudio: false,
    provider: isMock ? "mock (Kling T2V capability shape)" : "kling-v3-standard-t2v",
  };
}

export function videoPricing(runtime: GenerationMode): VideoPricing {
  return {
    available: runtime !== "disabled",
    mock: runtime === "mock",
    modes: {
      text_to_video: videoModePricing("text_to_video", runtime),
      image_to_video: videoModePricing("image_to_video", runtime),
    },
  };
}

/** Server-authoritative price/cost for one video job; null if unsupported. */
export function videoJobPricing(
  runtime: GenerationMode,
  generationMode: VideoGenerationMode,
  duration: VideoDurationSeconds
): { creditsPerGeneration: number; costBoundMicros: number } | null {
  if (runtime === "disabled") return null;
  const mode = videoModePricing(generationMode, runtime);
  if (!mode.durations.includes(duration)) return null;
  const credits = mode.creditsByDuration[duration];
  const cost = mode.costBoundMicrosByDuration[duration];
  if (!credits || !cost) return null;
  return { creditsPerGeneration: credits, costBoundMicros: cost };
}

export function isVideoDurationSupported(
  runtime: GenerationMode,
  generationMode: VideoGenerationMode,
  duration: unknown
): duration is VideoDurationSeconds {
  return (
    typeof duration === "number" &&
    videoModePricing(generationMode, runtime).durations.includes(
      duration as VideoDurationSeconds
    )
  );
}

export function isVideoAspectRatioSupported(
  generationMode: VideoGenerationMode,
  ratio: AspectRatioId
): boolean {
  return videoModePricing(generationMode, "mock").aspectRatios.includes(ratio);
}
