import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  extractFramesWithFfmpeg,
  OutputModerationService,
  type OutputVerdict,
} from "./output-moderation.js";
import { FAL_NSFW_ENDPOINT } from "../modules/generation/fal.endpoints.js";
import type { ApiEnv } from "../config/env.js";

const execFile = promisify(execFileCb);

/**
 * fal.ai NSFW output screening (AIGC compliance stage 2, default backend).
 *
 * Replaces the OpenAI Moderation dependency with `fal-ai/imageutils/nsfw`,
 * authenticated by the SAME FAL_KEY that live generation already requires —
 * output screening is therefore available wherever live generation is, and
 * "no OpenAI key" is never treated as a pass:
 *
 *   POST https://fal.run/fal-ai/imageutils/nsfw   (Authorization: Key <FAL_KEY>)
 *   { image_url: "data:image/jpeg;base64,…" }     -> { nsfw_probability: 0..1 }
 *
 * Official schema (checked 2026-11-04): input {image_url} (required),
 * output {nsfw_probability} (required number). Any non-2xx response,
 * malformed body, non-finite probability or transport error is
 * "unavailable" — fail closed, exactly like the OpenAI backend.
 *
 * PRODUCTION INCIDENT FIX (2026-11-04, jobs bdc3b384…): the worker screened
 * the FULL-SIZE generated PNG (multi-MB) embedded as a base64 data URI in
 * the JSON body. fal rejects large sync payloads (documented 413
 * PayloadTooLarge class on the inference API), so real desktop-size images
 * failed while the small standalone probe returned 200. Every failure was
 * collapsed into "unavailable" with no diagnostics. The fix screens a
 * COMPACT REVIEW COPY instead of the raw bytes:
 *
 *  - compact JPEG/PNG/WebP (<= REVIEW_PASSTHROUGH_BYTES) pass through as-is;
 *  - anything larger is re-encoded IN MEMORY via the image's own ffmpeg
 *    (already required for video frame sampling) to a JPEG review copy with
 *    max edge REVIEW_MAX_EDGE (1280) — a few hundred KB, safely below any
 *    transport limit, still fully recognizable content;
 *  - if conversion fails: a compact original is used as-is; a large original
 *    is rejected WITHOUT a doomed network call (logged conversion_failed);
 *  - the delivered/stored media is ALWAYS the untouched original bytes —
 *    the review copy exists only inside this request;
 *  - the review copy is never persisted or exposed publicly.
 *
 * Video coverage is UNCHANGED: ffmpeg samples N evenly spaced frames
 * (first/last included), each frame runs through the SAME review-copy
 * normalization before screening; ANY blocked frame blocks the video;
 * extraction failure or any unscreenable frame fails closed.
 *
 * Coverage note (deliberate, documented): a single-label NSFW classifier
 * judges adult sexual content only. Violence/gore, self-harm, hate symbols,
 * impersonation and copyright are NOT machine-judged here — they are covered
 * upstream (Waffo Prompt Sift policy categories + local blocklist on every
 * prompt) and downstream (user outputs stay private; public gallery publishing
 * runs the human import gate + rescan; reports get human review).
 */

export const DEFAULT_FAL_NSFW_THRESHOLD = 0.5;
/** Compact originals below this size skip conversion (base64 ~1.4x safety). */
export const REVIEW_PASSTHROUGH_BYTES = 512 * 1024;
/** Max edge of the ffmpeg-generated JPEG review copy. */
export const REVIEW_MAX_EDGE = 1280;

export type FalNsfwErrorCategory =
  | "none"
  | "http_error"
  | "bad_shape"
  | "transport_timeout"
  | "transport_error"
  | "conversion_failed";

/** Sanitized, structured diagnostics — NEVER includes bytes, keys or prompts. */
export interface FalNsfwLogEvent {
  event: "output_moderation.request";
  backend: "fal_nsfw";
  jobId?: string;
  mime: string;
  bytes: number;
  reviewMime?: string;
  reviewBytes?: number;
  converted: boolean;
  httpStatus: number | null;
  errorCategory: FalNsfwErrorCategory;
  latencyMs: number;
  threshold: number;
}

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
  /** Review-copy encoder; defaults to the in-image ffmpeg. Tests inject. */
  reviewImageConverter?: (
    bytes: Buffer,
    mime: string,
    maxEdge: number
  ) => Promise<{ bytes: Buffer; mime: string }>;
  ffmpegPath?: string;
  log?: (event: FalNsfwLogEvent) => void;
}

function clampThreshold(value: number | undefined): number {
  if (!Number.isFinite(value as number)) return DEFAULT_FAL_NSFW_THRESHOLD;
  return Math.min(1, Math.max(0, value as number));
}

function clampFrameCount(value: number | undefined): number {
  if (!Number.isFinite(value as number)) return 5;
  return Math.min(10, Math.max(1, Math.floor(value as number)));
}

const COMPACT_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * ffmpeg-based review-copy encoder: JPEG, max edge REVIEW_MAX_EDGE,
 * aspect preserved, quality-bounded (-q:v 3 ≈ 200–500 KB at 1280px).
 * Runs through temp files exactly like the frame sampler (the same ffmpeg
 * the image already ships for video screening).
 */
export async function convertReviewImageWithFfmpeg(
  bytes: Buffer,
  mime: string,
  maxEdge: number,
  ffmpegPath = "ffmpeg"
): Promise<{ bytes: Buffer; mime: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "nsfw-review-"));
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const input = path.join(dir, `in.${ext}`);
  const output = path.join(dir, "review.jpg");
  try {
    await writeFile(input, bytes);
    const scale = `scale='min(${maxEdge},iw)':'min(${maxEdge},ih)':force_original_aspect_ratio=decrease`;
    await execFile(ffmpegPath, [
      "-y", "-i", input,
      "-vf", scale,
      "-q:v", "3",
      "-f", "mjpeg",
      output,
    ], { timeout: 20_000 });
    const out = await readFile(output);
    if (out.length === 0) throw new Error("empty review copy");
    return { bytes: out, mime: "image/jpeg" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
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

  /**
   * Produces the compact review image for one candidate: compact originals
   * pass through; larger ones are re-encoded to a small JPEG review copy.
   * Returns null when nothing screenable can be produced (large input whose
   * conversion failed) — the caller fails closed WITHOUT a doomed request.
   */
  private async prepareReviewImage(
    bytes: Buffer,
    mime: string,
    jobId: string | undefined
  ): Promise<{ bytes: Buffer; mime: string; converted: boolean } | null> {
    const compact = COMPACT_MIMES.has(mime) && bytes.length <= REVIEW_PASSTHROUGH_BYTES;
    if (compact) return { bytes, mime, converted: false };
    const converter =
      this.options.reviewImageConverter ??
      ((b: Buffer, m: string, edge: number) =>
        convertReviewImageWithFfmpeg(b, m, edge, this.options.ffmpegPath));
    try {
      const review = await converter(bytes, mime, REVIEW_MAX_EDGE);
      if (review.bytes.length === 0) throw new Error("empty review copy");
      return { bytes: review.bytes, mime: review.mime, converted: true };
    } catch {
      // Conversion failed: a compact original is still screenable; a large
      // one would only repeat the transport failure — fail closed now.
      if (bytes.length <= REVIEW_PASSTHROUGH_BYTES) {
        return { bytes, mime, converted: false };
      }
      this.options.log?.({
        event: "output_moderation.request",
        backend: "fal_nsfw",
        jobId,
        mime,
        bytes: bytes.length,
        converted: false,
        httpStatus: null,
        errorCategory: "conversion_failed",
        latencyMs: 0,
        threshold: this.threshold,
      });
      return null;
    }
  }

  private async moderateImage(
    bytes: Buffer,
    mime: string,
    jobId?: string
  ): Promise<OutputVerdict> {
    if (!this.enabled) {
      return { action: "unavailable", categories: [], status: null };
    }
    const review = await this.prepareReviewImage(bytes, mime, jobId);
    if (!review) {
      return { action: "unavailable", categories: [], status: null };
    }
    const endpoint = this.options.endpoint ?? FAL_NSFW_ENDPOINT;
    const body = JSON.stringify({
      image_url: `data:${review.mime};base64,${review.bytes.toString("base64")}`,
    });
    const startedAt = Date.now();
    let httpStatus: number | null = null;
    let errorCategory: FalNsfwErrorCategory = "none";
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
      httpStatus = response.status;
      if (!response.ok) {
        errorCategory = "http_error";
        return { action: "unavailable", categories: [], status: response.status };
      }
      const parsed = (await response.json().catch(() => null)) as {
        nsfw_probability?: unknown;
      } | null;
      const probability = parsed?.nsfw_probability;
      if (typeof probability !== "number" || !Number.isFinite(probability)) {
        errorCategory = "bad_shape";
        return { action: "unavailable", categories: [], status: response.status };
      }
      if (probability >= this.threshold) {
        return { action: "block", categories: ["nsfw"], status: response.status };
      }
      return { action: "allow", categories: [], status: response.status };
    } catch (error) {
      errorCategory =
        error instanceof Error && error.name === "TimeoutError"
          ? "transport_timeout"
          : "transport_error";
      return { action: "unavailable", categories: [], status: null };
    } finally {
      this.options.log?.({
        event: "output_moderation.request",
        backend: "fal_nsfw",
        jobId,
        mime,
        bytes: bytes.length,
        reviewMime: review.mime,
        reviewBytes: review.bytes.length,
        converted: review.converted,
        httpStatus,
        errorCategory,
        latencyMs: Date.now() - startedAt,
        threshold: this.threshold,
      });
    }
  }

  /** Screens one generated image (or poster frame). */
  async screenImage(input: {
    bytes: Buffer;
    mime: string;
    jobId?: string;
  }): Promise<OutputVerdict> {
    return this.moderateImage(input.bytes, input.mime, input.jobId);
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
    jobId?: string;
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
      const verdict = await this.moderateImage(frame, "image/png", input.jobId);
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
  env: ApiEnv,
  log?: (event: FalNsfwLogEvent) => void
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
      log,
    });
  }
  return undefined;
}
