import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { isMp4 } from "./storage.js";

const execFile = promisify(execFileCb);

/**
 * Post-generation output moderation (AIGC compliance stage 2).
 *
 * Waffo's Content Safety API is prompt-only (scan-prompt); their AIGC
 * compliance page explicitly allows the OUTPUT moderation step to be our
 * own system, provided it actually analyzes the generated media. This
 * service implements that step against the OpenAI Moderation API
 * (omni-moderation-latest), which accepts images (base64 data URLs) and
 * text and returns per-category verdicts:
 *   POST https://api.openai.com/v1/moderations   (Authorization: Bearer)
 *   { model, input: [{ type: "image_url", image_url: { url } }] }
 *   -> { results: [{ flagged: bool, categories: {...}, ... }] }
 *
 * Video coverage: the container's ffmpeg samples N evenly spaced frames
 * from the generated MP4 and each frame is screened as an image; ANY
 * flagged frame blocks the whole video. Frame extraction is injectable
 * for tests. If ffmpeg is missing or fails, the verdict is "unavailable"
 * — fail closed: unscreenable output is never stored or published.
 *
 * Safety contract:
 *  - enabled=false (no API key) resolves to "unavailable"; callers must
 *    not publish unscreened output.
 *  - screen* never throws and never returns raw provider error text.
 *  - Fal providers additionally run their own safety checker
 *    (enable_safety_checker: true) — that provider-side layer does NOT
 *    replace this one; it is a first filter on the provider response.
 */

export type OutputVerdictAction = "allow" | "block" | "unavailable";

export interface OutputVerdict {
  action: OutputVerdictAction;
  /** Flagged category names (provider vocabulary), empty unless block. */
  categories: string[];
  status: number | null;
}

export interface OutputModerationOptions {
  apiKey: string | null;
  endpoint?: string;
  model?: string;
  /** Frames sampled per video. Default 5, capped 1..10. */
  frames?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  /** Injectable frame extractor for tests. */
  frameExtractor?: (
    bytes: Buffer,
    mime: string,
    count: number,
    durationSeconds: number | null
  ) => Promise<Buffer[]>;
  sleep?: (ms: number) => Promise<void>;
  /** ffmpeg/ffprobe binary paths (tests may point at fakes). */
  ffmpegPath?: string;
  ffprobePath?: string;
}

export const DEFAULT_OUTPUT_MODERATION_ENDPOINT =
  "https://api.openai.com/v1/moderations";
export const DEFAULT_OUTPUT_MODERATION_MODEL = "omni-moderation-latest";

function clampFrameCount(value: number | undefined): number {
  if (!Number.isFinite(value as number)) return 5;
  return Math.min(10, Math.max(1, Math.floor(value as number)));
}

export class OutputModerationService {
  readonly enabled: boolean;
  readonly frameCount: number;

  constructor(private readonly options: OutputModerationOptions) {
    this.enabled = Boolean(options.apiKey);
    this.frameCount = clampFrameCount(options.frames);
  }

  private async moderateImage(
    bytes: Buffer,
    mime: string
  ): Promise<OutputVerdict> {
    if (!this.enabled) {
      return { action: "unavailable", categories: [], status: null };
    }
    const endpoint = this.options.endpoint ?? DEFAULT_OUTPUT_MODERATION_ENDPOINT;
    const body = JSON.stringify({
      model: this.options.model ?? DEFAULT_OUTPUT_MODERATION_MODEL,
      input: [
        {
          type: "image_url",
          image_url: { url: `data:${mime};base64,${bytes.toString("base64")}` },
        },
      ],
    });
    try {
      const response = await (this.options.fetcher ?? fetch)(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey!}`,
        },
        body,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
      });
      if (!response.ok) {
        return { action: "unavailable", categories: [], status: response.status };
      }
      const parsed = (await response.json().catch(() => null)) as {
        results?: Array<{
          flagged?: unknown;
          categories?: Record<string, unknown>;
        }>;
      } | null;
      const result = parsed?.results?.[0];
      if (!result || typeof result.flagged !== "boolean") {
        return { action: "unavailable", categories: [], status: response.status };
      }
      if (!result.flagged) {
        return { action: "allow", categories: [], status: response.status };
      }
      const categories = result.categories
        ? Object.entries(result.categories)
            .filter(([, flagged]) => flagged === true)
            .map(([category]) => category)
        : [];
      return {
        action: "block",
        categories: categories.length > 0 ? categories : ["flagged"],
        status: response.status,
      };
    } catch {
      return { action: "unavailable", categories: [], status: null };
    }
  }

  /** Screens one generated image (or poster frame). */
  async screenImage(input: { bytes: Buffer; mime: string }): Promise<OutputVerdict> {
    return this.moderateImage(input.bytes, input.mime);
  }

  /**
   * Screens one generated video by sampling frames and moderating each.
   * Any blocked frame blocks the video; any unresolvable frame (with no
   * block) fails closed as unavailable.
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
      const verdict = await this.moderateImage(
        frame,
        "image/png"
      );
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
      // Any frame we could not screen (transport/HTTP/shape failure) fails
      // closed even when other frames passed.
      return { action: "unavailable", categories: [], status: unavailableStatus };
    }
    return { action: "allow", categories: [], status: null };
  }
}

async function probeDuration(input: string, ffprobePath: string): Promise<number> {
  const { stdout } = await execFile(
    ffprobePath,
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", input],
    { timeout: 15_000 }
  );
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("no duration");
  }
  return duration;
}

/**
 * Evenly spaced frame offsets that ALWAYS include the first and the last
 * frame of the video, with the remaining frames distributed in between.
 * The final offset clamps just inside the end of the file so `ffmpeg -ss`
 * still lands on a decodable frame. A single frame samples the middle.
 */
export function frameOffsets(durationSeconds: number, count: number): number[] {
  const duration = Math.max(0, durationSeconds);
  const last = Math.max(0, duration - 0.1);
  if (count <= 1) return [duration / 2];
  const offsets: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (index === 0) offsets.push(0);
    else if (index === count - 1) offsets.push(last);
    else offsets.push(Math.min(last, (duration * index) / (count - 1)));
  }
  return offsets;
}

/**
 * Default ffmpeg frame sampling: writes the MP4 to a private temp dir and
 * extracts `count` evenly spaced frames (first + last included) as PNGs.
 * Throws when ffmpeg (or the input) is unusable — callers treat that as
 * "unavailable".
 */
export async function extractFramesWithFfmpeg(
  bytes: Buffer,
  mime: string,
  count: number,
  durationSeconds: number | null
): Promise<Buffer[]> {
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
  const ffprobePath = process.env.FFPROBE_PATH || "ffprobe";
  const tmp = await mkdtemp(path.join(os.tmpdir(), "wallhaze-mod-"));
  try {
    const input = path.join(tmp, isMp4(bytes) ? "input.mp4" : "input.bin");
    await writeFile(input, bytes);
    const duration = durationSeconds ?? (await probeDuration(input, ffprobePath));
    const frames: Buffer[] = [];
    let index = 0;
    for (const offset of frameOffsets(duration, count)) {
      const out = path.join(tmp, `frame-${index}.png`);
      index += 1;
      await execFile(
        ffmpegPath,
        [
          "-ss",
          offset.toFixed(2),
          "-i",
          input,
          "-frames:v",
          "1",
          "-f",
          "image2",
          "-y",
          out,
        ],
        { timeout: 30_000 }
      );
      frames.push(await readFile(out));
    }
    return frames;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
