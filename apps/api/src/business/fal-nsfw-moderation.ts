import {
  extractFramesWithFfmpeg,
  OutputModerationService,
  type OutputVerdict,
} from "./output-moderation.js";
import { FAL_NSFW_ENDPOINT } from "../modules/generation/fal.endpoints.js";
import type { ApiEnv } from "../config/env.js";

/**
 * fal.ai NSFW output screening (AIGC compliance stage 2, default backend).
 *
 * Replaces the OpenAI Moderation dependency with `fal-ai/imageutils/nsfw`,
 * authenticated by the SAME FAL_KEY that live generation already requires —
 * output screening is therefore available wherever live generation is, and
 * "no OpenAI key" is never treated as a pass:
 *
 *   POST https://fal.run/fal-ai/imageutils/nsfw   (Authorization: Key <FAL_KEY>)
 *   { image_url: "data:image/png;base64,…" }      -> { nsfw_probability: 0..1 }
 *
 * Official schema (checked 2026-11-04): input {image_url} (required),
 * output {nsfw_probability} (required number). Any non-2xx response,
 * malformed body, non-finite probability or transport error is
 * "unavailable" — fail closed, exactly like the OpenAI backend.
 *
 * Video coverage is UNCHANGED: ffmpeg samples N evenly spaced frames
 * (first/last included), each frame is screened as an image; ANY blocked
 * frame blocks the video; extraction failure or any unscreenable frame
 * fails closed. The provider's own enable_safety_checker remains a first
 * filter and never replaces this stage.
 *
 * Coverage note (deliberate, documented): a single-label NSFW classifier
 * judges adult sexual content only. Violence/gore, self-harm, hate symbols,
 * impersonation and copyright are NOT machine-judged here — they are covered
 * upstream (Waffo Prompt Sift policy categories + local blocklist on every
 * prompt) and downstream (user outputs stay private; public gallery publishing
 * runs the human import gate + rescan; reports get human review).
 */

export const DEFAULT_FAL_NSFW_THRESHOLD = 0.5;

export interface FalNsfwModerationOptions {
  falKey: string | null;
  endpoint?: string;
  /** Block at or above this nsfw_probability. Default 0.5, clamped 0..1. */
  threshold?: number;
  /** Frames sampled per video. Default 5, capped 1..10. */
  frames?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  frameExtractor?: (
    bytes: Buffer,
    mime: string,
    count: number,
    durationSeconds: number | null
  ) => Promise<Buffer[]>;
  ffmpegPath?: string;
  ffprobePath?: string;
}

function clampThreshold(value: number | undefined): number {
  if (!Number.isFinite(value as number)) return DEFAULT_FAL_NSFW_THRESHOLD;
  return Math.min(1, Math.max(0, value as number));
}

function clampFrameCount(value: number | undefined): number {
  if (!Number.isFinite(value as number)) return 5;
  return Math.min(10, Math.max(1, Math.floor(value as number)));
}

export class FalNsfwModerationService {
  readonly enabled: boolean;
  readonly frameCount: number;
  readonly threshold: number;

  constructor(private readonly options: FalNsfwModerationOptions) {
    this.enabled = Boolean(options.falKey);
    this.threshold = clampThreshold(options.threshold);
    this.frameCount = clampFrameCount(options.frames);
  }

  private async moderateImage(
    bytes: Buffer,
    mime: string
  ): Promise<OutputVerdict> {
    if (!this.enabled) {
      return { action: "unavailable", categories: [], status: null };
    }
    const endpoint = this.options.endpoint ?? FAL_NSFW_ENDPOINT;
    const body = JSON.stringify({
      image_url: `data:${mime};base64,${bytes.toString("base64")}`,
    });
    try {
      const response = await (this.options.fetcher ?? fetch)(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${this.options.falKey!}`,
        },
        body,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
      });
      if (!response.ok) {
        return { action: "unavailable", categories: [], status: response.status };
      }
      const parsed = (await response.json().catch(() => null)) as {
        nsfw_probability?: unknown;
      } | null;
      const probability = parsed?.nsfw_probability;
      if (typeof probability !== "number" || !Number.isFinite(probability)) {
        return { action: "unavailable", categories: [], status: response.status };
      }
      if (probability >= this.threshold) {
        return { action: "block", categories: ["nsfw"], status: response.status };
      }
      return { action: "allow", categories: [], status: response.status };
    } catch {
      return { action: "unavailable", categories: [], status: null };
    }
  }

  /** Screens one generated image (or poster frame). */
  async screenImage(input: {
    bytes: Buffer;
    mime: string;
  }): Promise<OutputVerdict> {
    return this.moderateImage(input.bytes, input.mime);
  }

  /**
   * Screens one generated video by sampling frames and moderating each.
   * Semantics mirror the OpenAI backend exactly: any blocked frame blocks
   * the video; extraction failure or any unscreenable frame fails closed.
   */
  async screenVideo(input: {
    bytes: Buffer;
    mime: string;
    durationSeconds: number | null;
  }): Promise<OutputVerdict> {
    if (!this.enabled) {
      return { action: "unavailable", categories: [], status: null };
    }
    let frames: Buffer[];
    try {
      const extractor =
        this.options.frameExtractor ?? extractFramesWithFfmpeg;
      frames = await extractor(
        input.bytes,
        input.mime,
        this.frameCount,
        input.durationSeconds
      );
    } catch {
      // Missing/failed ffmpeg: the output cannot be screened — fail closed.
      return { action: "unavailable", categories: [], status: null };
    }
    if (frames.length === 0) {
      return { action: "unavailable", categories: [], status: null };
    }
    const blockedCategories = new Set<string>();
    let sawUnavailable = false;
    let unavailableStatus: number | null = null;
    for (const frame of frames) {
      const verdict = await this.moderateImage(frame, "image/png");
      if (verdict.action === "block") {
        for (const category of verdict.categories) blockedCategories.add(category);
      } else if (verdict.action === "unavailable") {
        sawUnavailable = true;
        unavailableStatus = verdict.status;
      }
    }
    if (blockedCategories.size > 0) {
      return {
        action: "block",
        categories: [...blockedCategories],
        status: null,
      };
    }
    if (sawUnavailable) {
      // Any frame we could not screen fails closed even when others passed.
      return { action: "unavailable", categories: [], status: unavailableStatus };
    }
    return { action: "allow", categories: [], status: null };
  }
}

/**
 * Env-based output-screening selection (the ONLY place backend precedence
 * lives):
 *  1. OUTPUT_MODERATION_API_KEY set → OpenAI backend (legacy, unchanged);
 *  2. else FAL_KEY set → fal NSFW backend (default path — reuses the live
 *     generation key, so screening exists wherever generation exists);
 *  3. else undefined → callers fail closed (live output is never stored).
 */
export function resolveOutputModerationFromEnv(
  env: ApiEnv
): OutputModerationService | FalNsfwModerationService | undefined {
  if (env.OUTPUT_MODERATION_API_KEY) {
    return new OutputModerationService({
      apiKey: env.OUTPUT_MODERATION_API_KEY,
      endpoint: env.OUTPUT_MODERATION_ENDPOINT,
      model: env.OUTPUT_MODERATION_MODEL,
      frames: env.OUTPUT_MODERATION_FRAMES
        ? Number(env.OUTPUT_MODERATION_FRAMES)
        : undefined,
    });
  }
  if (env.FAL_KEY) {
    const threshold = env.FAL_NSFW_THRESHOLD
      ? Number(env.FAL_NSFW_THRESHOLD)
      : undefined;
    return new FalNsfwModerationService({
      falKey: env.FAL_KEY,
      threshold: Number.isFinite(threshold as number)
        ? (threshold as number)
        : undefined,
    });
  }
  return undefined;
}
