import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AspectRatioId, VideoDurationSeconds } from "@wallhaze/contracts";
import {
  downloadVideo,
  validateImage,
  type StoredMedia,
} from "../../business/storage.js";
import { probeMp4Metadata } from "../../business/media-metadata.js";

/**
 * Video provider boundary.
 *
 * Only this module talks to video models. Real calls require an explicitly
 * constructed adapter with FAL_LIVE_ENABLED + FAL_KEY (see server/worker
 * wiring); tests and local development use MockVideoProvider and an injected
 * fetch, so no test can reach the network.
 *
 * fal video models run on the queue API (submit → poll → result). The
 * adapter never retries: a retry can double-bill. The worker additionally
 * refuses a re-claimed live job (UPSTREAM_UNCERTAIN).
 */

export interface VideoProviderInput {
  generationMode: "text_to_video" | "image_to_video";
  durationSeconds: VideoDurationSeconds;
  aspectRatio: AspectRatioId;
  finalPrompt: string;
  motionPrompt: string;
  negativePrompt: string;
  /** Validated PNG/JPEG/WebP data URI; required for image-to-video. */
  sourceImageDataUri: string | null;
  width: number | null;
  height: number | null;
}

export interface VideoProviderOutput {
  video: StoredMedia;
  poster: StoredMedia | null;
  durationSeconds: VideoDurationSeconds;
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown>;
}

export interface VideoJobProvider {
  readonly providerId: string;
  generate(
    input: VideoProviderInput,
    signal: AbortSignal
  ): Promise<VideoProviderOutput>;
}

export class VideoProviderError extends Error {
  readonly failure: "timeout" | "upstream" | "invalid" | "download";
  constructor(failure: VideoProviderError["failure"], message: string) {
    super(message);
    this.name = "VideoProviderError";
    this.failure = failure;
  }
}

const RATIO_KEY: Record<AspectRatioId, string> = {
  "9:16": "9x16",
  "3:4": "3x4",
  "1:1": "1x1",
  "4:3": "4x3",
  "16:9": "16x9",
};

const MOCK_DIMENSIONS: Record<AspectRatioId, { width: number; height: number }> = {
  "9:16": { width: 360, height: 640 },
  "3:4": { width: 360, height: 480 },
  "1:1": { width: 480, height: 480 },
  "4:3": { width: 480, height: 360 },
  "16:9": { width: 640, height: 360 },
};

const mockRoot = new URL("../../../assets/live-mock/", import.meta.url);

/** Try source-tree and dist/cwd asset layouts (dev tsx vs built artifact). */
async function readMockAsset(file: string): Promise<Buffer> {
  const candidates = [
    fileURLToPath(new URL(file, mockRoot)),
    join(process.cwd(), "assets", "live-mock", file),
    join(process.cwd(), "dist", "assets", "live-mock", file),
    join(process.cwd(), "apps", "api", "assets", "live-mock", file),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch {
      // try the next layout
    }
  }
  throw new Error("MOCK_VIDEO_MISSING");
}

/**
 * Development mock: a real, silent H.264 MP4 generated from a canvas and
 * clearly labelled MOCK inside the video. It is never presented as model
 * output; the job/creation carries `mock=true` and the UI shows a badge.
 */
export class MockVideoProvider implements VideoJobProvider {
  readonly providerId = "mock-video";

  async generate(
    input: VideoProviderInput,
    signal: AbortSignal
  ): Promise<VideoProviderOutput> {
    signal.throwIfAborted();
    const key = RATIO_KEY[input.aspectRatio] ?? RATIO_KEY["9:16"];
    const base = `${key}-${input.durationSeconds}s`;
    let bytes: Buffer;
    let posterBytes: Buffer;
    try {
      [bytes, posterBytes] = await Promise.all([
        readMockAsset(`${base}.mp4`),
        readMockAsset(`${base}.png`),
      ]);
    } catch {
      throw new VideoProviderError(
        "invalid",
        "Mock video fixtures are missing from the API artifact"
      );
    }
    const dims = MOCK_DIMENSIONS[input.aspectRatio];
    return {
      video: { bytes, mime: "video/mp4" },
      poster: { bytes: posterBytes, mime: "image/png" },
      durationSeconds: input.durationSeconds,
      width: dims.width,
      height: dims.height,
      metadata: {
        source: "mock",
        codec: "h264",
        fps: 24,
        audio: false,
        width: dims.width,
        height: dims.height,
      },
    };
  }
}

interface QueueStatus {
  request_id?: string;
  status?: string;
}

interface QueueResult {
  video?: { url?: string; content_type?: string | null; file_size?: number | null };
}

const VIDEO_QUEUE_TIMEOUT_MS = 8 * 60 * 1000;
const VIDEO_POLL_INTERVAL_MS = 2_000;
const VIDEO_REQUEST_TIMEOUT_MS = 30_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new VideoProviderError("timeout", "Video request aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new VideoProviderError("timeout", "Video request aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function decodeDataUri(dataUri: string): { bytes: Buffer; mime: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(
    dataUri
  );
  if (!match) throw new VideoProviderError("invalid", "Invalid source image");
  const bytes = Buffer.from(match[2], "base64");
  validateImage(bytes, match[1]);
  return { bytes, mime: match[1] };
}

/**
 * Shared fal queue adapter. The endpoint/payload construction differs per
 * model; submission, polling, downloading and error mapping are shared.
 */
class FalQueueVideoProvider implements VideoJobProvider {
  constructor(
    readonly providerId: string,
    private readonly endpoint: string,
    private readonly falKey: string,
    private readonly fetcher: typeof fetch,
    private readonly buildPayload: (input: VideoProviderInput) => Record<string, unknown>,
    private readonly expectedDimensions: (input: VideoProviderInput) => { width: number | null; height: number | null }
  ) {}

  async generate(
    input: VideoProviderInput,
    outerSignal: AbortSignal
  ): Promise<VideoProviderOutput> {
    const deadline = AbortSignal.timeout(VIDEO_QUEUE_TIMEOUT_MS);
    const signal = AbortSignal.any([outerSignal, deadline]);
    const payload = this.buildPayload(input);

    let requestId: string;
    try {
      const response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Key ${this.falKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.any([signal, AbortSignal.timeout(VIDEO_REQUEST_TIMEOUT_MS)]),
      });
      if (!response.ok) {
        throw new VideoProviderError(
          "upstream",
          `Video submit failed (${response.status})`
        );
      }
      const status = (await response.json()) as QueueStatus;
      if (!status.request_id) {
        throw new VideoProviderError("invalid", "Video submit returned no request id");
      }
      requestId = status.request_id;
    } catch (error) {
      if (error instanceof VideoProviderError) throw error;
      if (signal.aborted) throw new VideoProviderError("timeout", "Video request timed out");
      throw new VideoProviderError("upstream", "Video submit request failed");
    }

    for (;;) {
      if (signal.aborted) {
        throw new VideoProviderError("timeout", "Video request timed out");
      }
      await sleep(VIDEO_POLL_INTERVAL_MS, signal);
      let state: QueueStatus;
      try {
        const response = await this.fetcher(
          `${this.endpoint}/requests/${encodeURIComponent(requestId)}/status`,
          {
            headers: { Authorization: `Key ${this.falKey}` },
            signal: AbortSignal.any([
              signal,
              AbortSignal.timeout(VIDEO_REQUEST_TIMEOUT_MS),
            ]),
          }
        );
        if (!response.ok) {
          throw new VideoProviderError(
            "upstream",
            `Video status failed (${response.status})`
          );
        }
        state = (await response.json()) as QueueStatus;
      } catch (error) {
        if (error instanceof VideoProviderError) throw error;
        if (signal.aborted) {
          throw new VideoProviderError("timeout", "Video request timed out");
        }
        throw new VideoProviderError("upstream", "Video status request failed");
      }
      if (state.status === "COMPLETED") break;
      if (state.status === "FAILED" || state.status === "CANCELED") {
        throw new VideoProviderError("upstream", "Video generation failed");
      }
    }

    let result: QueueResult;
    try {
      const response = await this.fetcher(
        `${this.endpoint}/requests/${encodeURIComponent(requestId)}`,
        {
          headers: { Authorization: `Key ${this.falKey}` },
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(VIDEO_REQUEST_TIMEOUT_MS),
          ]),
        }
      );
      if (!response.ok) {
        throw new VideoProviderError(
          "upstream",
          `Video result failed (${response.status})`
        );
      }
      result = (await response.json()) as QueueResult;
    } catch (error) {
      if (error instanceof VideoProviderError) throw error;
      if (signal.aborted) {
        throw new VideoProviderError("timeout", "Video request timed out");
      }
      throw new VideoProviderError("upstream", "Video result request failed");
    }
    const url = result.video?.url;
    if (!url) throw new VideoProviderError("invalid", "Video result had no URL");

    let video: StoredMedia;
    try {
      video = await downloadVideo(url, this.fetcher);
    } catch {
      throw new VideoProviderError("download", "Video download failed");
    }

    let poster: StoredMedia | null = null;
    if (input.generationMode === "image_to_video" && input.sourceImageDataUri) {
      const source = decodeDataUri(input.sourceImageDataUri);
      poster = { bytes: source.bytes, mime: source.mime };
    }
    const dims = this.expectedDimensions(input);
    const probed = probeMp4Metadata(video.bytes);
    return {
      video,
      poster,
      durationSeconds: input.durationSeconds,
      width: probed.width ?? dims.width,
      height: probed.height ?? dims.height,
      metadata: {
        provider: this.providerId,
        requestId,
        codec: "h264",
        audio: false,
        resolutionClass: input.generationMode === "image_to_video" ? "720p" : "standard",
        width: probed.width ?? dims.width,
        height: probed.height ?? dims.height,
        actualDurationSeconds: probed.durationSeconds,
      },
    };
  }
}

const WAN_I2V_ENDPOINT =
  "https://queue.fal.run/fal-ai/wan/v2.2-5b/image-to-video";
const KLING_T2V_ENDPOINT =
  "https://queue.fal.run/fal-ai/kling-video/v3/standard/text-to-video";

function wanDimensions(input: VideoProviderInput): { width: number; height: number } {
  if (input.aspectRatio === "9:16") return { width: 720, height: 1280 };
  if (input.aspectRatio === "1:1") return { width: 720, height: 720 };
  return { width: 1280, height: 720 };
}

/**
 * Live provider set. Constructing this does NOT call fal.ai; only a worker
 * executing a queued job can. The caller must have verified
 * FAL_LIVE_ENABLED=1 and FAL_KEY. Audio is explicitly off.
 */
export function createLiveVideoProviders(deps: {
  falKey: string;
  fetcher: typeof fetch;
}): {
  imageToVideo: VideoJobProvider;
  textToVideo: VideoJobProvider;
} {
  return {
    imageToVideo: new FalQueueVideoProvider(
      "wan-2.2-5b-i2v",
      WAN_I2V_ENDPOINT,
      deps.falKey,
      deps.fetcher,
      (input) => ({
        image_url: input.sourceImageDataUri,
        prompt: input.finalPrompt,
        negative_prompt: input.negativePrompt,
        num_frames: Math.min(161, Math.round(input.durationSeconds * 24)),
        frames_per_second: 24,
        resolution: "720p",
        aspect_ratio: input.aspectRatio,
        enable_safety_checker: true,
        video_quality: "high",
      }),
      (input) => wanDimensions(input)
    ),
    textToVideo: new FalQueueVideoProvider(
      "kling-v3-standard-t2v",
      KLING_T2V_ENDPOINT,
      deps.falKey,
      deps.fetcher,
      (input) => ({
        prompt: input.finalPrompt,
        duration: String(input.durationSeconds),
        generate_audio: false,
        aspect_ratio: input.aspectRatio,
        negative_prompt: input.negativePrompt,
        enable_safety_checker: true,
      }),
      () => ({ width: null, height: null })
    ),
  };
}

export function createMockVideoProviders(): {
  imageToVideo: VideoJobProvider;
  textToVideo: VideoJobProvider;
} {
  const provider = new MockVideoProvider();
  return { imageToVideo: provider, textToVideo: provider };
}
