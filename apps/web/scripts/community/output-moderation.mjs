#!/usr/bin/env node
/**
 * Output moderation client for reviewer-side tooling (import gate + local
 * gallery scans). Implements the SAME screening decision as the API's
 * OutputModerationService: OpenAI Moderation API (omni-moderation-latest)
 * for images and sampled video frames, fail closed on any unavailable
 * result. Runs OUTSIDE the app (no build step) via plain node:fs/process.
 *
 * Required env: OUTPUT_MODERATION_API_KEY (refuses to run without it —
 * fail closed). Optional: OUTPUT_MODERATION_ENDPOINT, OUTPUT_MODERATION_MODEL,
 * OUTPUT_MODERATION_FRAMES, FFMPEG_PATH, FFPROBE_PATH.
 */
import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const ENDPOINT =
  process.env.OUTPUT_MODERATION_ENDPOINT ||
  "https://api.openai.com/v1/moderations";
const MODEL = process.env.OUTPUT_MODERATION_MODEL || "omni-moderation-latest";
const FRAME_COUNT = Math.min(10, Math.max(1, Number(process.env.OUTPUT_MODERATION_FRAMES ?? 5)));
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

export function moderationConfigured() {
  return Boolean(process.env.OUTPUT_MODERATION_API_KEY);
}

async function moderateImageBuffer(bytes, mime) {
  if (!moderationConfigured()) {
    return { action: "unavailable", categories: [], status: null };
  }
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OUTPUT_MODERATION_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${bytes.toString("base64")}` },
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return { action: "unavailable", categories: [], status: response.status };
    }
    const parsed = await response.json().catch(() => null);
    const result = parsed?.results?.[0];
    if (!result || typeof result.flagged !== "boolean") {
      return { action: "unavailable", categories: [], status: response.status };
    }
    if (!result.flagged) {
      return { action: "allow", categories: [], status: response.status };
    }
    const categories = Object.entries(result.categories ?? {})
      .filter(([, flagged]) => flagged === true)
      .map(([category]) => category);
    return {
      action: "block",
      categories: categories.length > 0 ? categories : ["flagged"],
      status: response.status,
    };
  } catch {
    return { action: "unavailable", categories: [], status: null };
  }
}

async function extractFrames(filePath, durationSeconds) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "wallhaze-webmod-"));
  try {
    let duration = durationSeconds;
    if (!duration) {
      const { stdout } = await execFile(FFPROBE, [
        "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath,
      ], { timeout: 15_000 });
      duration = Number(stdout.trim());
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error("no duration");
      }
    }
    // First + last + evenly spaced middle frames (same policy as the API).
    const last = Math.max(0, duration - 0.1);
    const offsets = [];
    for (let index = 0; index < FRAME_COUNT; index += 1) {
      if (FRAME_COUNT === 1) offsets.push(duration / 2);
      else if (index === 0) offsets.push(0);
      else if (index === FRAME_COUNT - 1) offsets.push(last);
      else offsets.push(Math.min(last, (duration * index) / (FRAME_COUNT - 1)));
    }
    const frames = [];
    let frameIndex = 0;
    for (const offset of offsets) {
      const out = path.join(tmp, `frame-${frameIndex}.png`);
      frameIndex += 1;
      await execFile(FFMPEG, [
        "-ss", offset.toFixed(2), "-i", filePath,
        "-frames:v", "1", "-f", "image2", "-y", out,
      ], { timeout: 30_000 });
      frames.push(await readFile(out));
    }
    return frames;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Screens one media file for publication.
 *   image: the file bytes are screened directly.
 *   video: N sampled frames are screened; ANY flagged frame blocks.
 * Fail closed: missing key, ffmpeg failure or provider errors resolve to
 * action "unavailable" — the caller must refuse to publish.
 */
export async function screenMediaFile(filePath, mediaType, { durationSeconds = null, mime = null } = {}) {
  if (!moderationConfigured()) {
    return { action: "unavailable", categories: [], status: null };
  }
  if (mediaType === "image") {
    const { readFile: read } = await import("node:fs/promises");
    const bytes = await read(filePath);
    const resolvedMime =
      mime ?? (filePath.endsWith(".png") ? "image/png" : filePath.endsWith(".webp") ? "image/webp" : "image/jpeg");
    return moderateImageBuffer(bytes, resolvedMime);
  }
  let frames;
  try {
    frames = await extractFrames(filePath, durationSeconds);
  } catch {
    return { action: "unavailable", categories: [], status: null };
  }
  if (frames.length === 0) {
    return { action: "unavailable", categories: [], status: null };
  }
  const blocked = new Set();
  for (const frame of frames) {
    const verdict = await moderateImageBuffer(frame, "image/png");
    if (verdict.action === "block") {
      for (const category of verdict.categories) blocked.add(category);
    } else if (verdict.action === "unavailable") {
      return { action: "unavailable", categories: [], status: verdict.status };
    }
  }
  if (blocked.size > 0) {
    return { action: "block", categories: [...blocked], status: null };
  }
  return { action: "allow", categories: [], status: null };
}
