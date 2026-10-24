import type { AspectRatioId, HistoryDevice } from "../catalog/sizes.js";
import type { WallStyle } from "./styles.js";
import { resolveStyleMeta, STYLE_PROMPT_VERSION } from "./style-meta.js";
import { resolveStyleMotionMeta } from "./style-motion.js";

/**
 * Server-side Prompt Builder.
 *
 * The client only sends a scene description + a style id; the trusted style
 * catalogue supplies the visual definition. The builder composes a prompt
 * with explicit axes (scene, style, palette, light, texture, composition,
 * device framing, subject-preservation rules) instead of appending a style
 * name to the user text.
 *
 * The composed prompt and its versions are persisted with the job so a
 * template change cannot silently alter a queued generation.
 */

export const PROMPT_BUILDER_VERSION = 2;
/** Video prompts version independently so static queued jobs do not drift. */
export const VIDEO_PROMPT_BUILDER_VERSION = 1;

/** Hard ceiling for the final prompt (user text is capped separately). */
export const MAX_FINAL_PROMPT_LENGTH = 1600;
/** Video prompts are longer (style + motion + preservation constraints). */
export const MAX_VIDEO_PROMPT_LENGTH = 2200;
/** Client motion instruction limit, before style guidance is composed. */
export const MOTION_PROMPT_MAX_LENGTH = 500;

export type PromptBuildErrorCode = "empty" | "too-long";

export class PromptBuildError extends Error {
  readonly code: PromptBuildErrorCode;
  constructor(code: PromptBuildErrorCode, message: string) {
    super(message);
    this.name = "PromptBuildError";
    this.code = code;
  }
}

export interface PromptBuildInput {
  userPrompt: string;
  style: WallStyle | null;
  device: HistoryDevice;
  ratio?: AspectRatioId;
  width?: number;
  height?: number;
  hasReference: boolean;
}

export interface BuiltPrompt {
  prompt: string;
  negativePrompt: string;
  styleVersion: number;
  builderVersion: number;
}

const DEFAULT_NEGATIVE =
  "text, watermark, logo, signature, blurry, low quality, deformed anatomy, duplicate subject";

const DEVICE_GUIDANCE: Record<HistoryDevice, string> = {
  phone:
    "Vertical phone wallpaper composition: keep the main subject clear of the very top edge (lock-screen clock area) and the bottom edge, with a calm margin around it",
  tablet:
    "Tablet wallpaper composition: balanced margins and a subject that stays readable in both portrait and landscape framings",
  desktop:
    "Wide desktop wallpaper composition: give the scene breathing room on the left and right, place the subject slightly off-center, and avoid important detail at the extreme edges",
};

const REFERENCE_GUIDANCE =
  "Use the subject from the reference photo as the main subject of this wallpaper. Preserve its distinctive appearance (face, hair, fur pattern, markings, silhouette and colors) as closely as the model allows. Place that subject naturally in the newly described scene, match the scene's perspective and light direction, add a believable contact shadow, and unify the color grade. Do not return the original photo unchanged, do not crop or cover the subject, and do not replace it with a different subject.";

function orientationOf(input: PromptBuildInput): "portrait" | "landscape" | "square" {
  if (input.width && input.height) {
    if (input.width === input.height) return "square";
    return input.width > input.height ? "landscape" : "portrait";
  }
  if (input.ratio === "1:1") return "square";
  if (input.ratio === "9:16" || input.ratio === "3:4") return "portrait";
  return "landscape";
}

/** Short, human-readable frame instruction for the target output. */
function frameGuidance(input: PromptBuildInput): string {
  const orientation = orientationOf(input);
  if (input.width && input.height) {
    return `Compose for a ${input.width}x${input.height} ${orientation} frame.`;
  }
  if (input.ratio) {
    return `Compose for a ${input.ratio} ${orientation} frame.`;
  }
  return `Compose for a ${orientation} frame that suits a ${input.device} wallpaper.`;
}

export function buildGenerationPrompt(input: PromptBuildInput): BuiltPrompt {
  const userPrompt = input.userPrompt.trim();
  const style = input.style;
  const scene =
    userPrompt ||
    (style
      ? "an atmospheric wallpaper scene that matches the selected style"
      : input.hasReference
        ? "a newly imagined wallpaper scene that naturally fits the uploaded subject"
        : "");

  if (!scene) {
    throw new PromptBuildError("empty", "Add a prompt or pick a style first.");
  }

  const parts: string[] = [`Scene: ${scene}.`];

  let negativePrompt = DEFAULT_NEGATIVE;

  if (style) {
    const meta = resolveStyleMeta(style);
    // Guard against a user pasting the template verbatim into the scene.
    if (!userPrompt.includes(style.promptTemplate)) {
      parts.push(`Style: ${style.promptTemplate}.`);
    }
    parts.push(
      `Palette: ${meta.palette}. Lighting: ${meta.lighting}. Texture: ${meta.texture}. Composition: ${meta.composition}.`
    );
    negativePrompt = meta.negativePrompt;
  }

  parts.push(
    `${DEVICE_GUIDANCE[input.device]} ${frameGuidance(input)}`
  );

  if (input.hasReference) {
    parts.push(REFERENCE_GUIDANCE);
  }

  const prompt = parts.join(" ").replace(/\s+/g, " ").trim();
  if (prompt.length > MAX_FINAL_PROMPT_LENGTH) {
    throw new PromptBuildError(
      "too-long",
      "The combined prompt is too long — shorten your description."
    );
  }

  return {
    prompt,
    negativePrompt,
    styleVersion: style?.promptVersion ?? STYLE_PROMPT_VERSION,
    builderVersion: PROMPT_BUILDER_VERSION,
  };
}

/* ------------------------------------------------------------------ */
/* Video Prompt Builder                                                */
/* ------------------------------------------------------------------ */

export interface VideoPromptBuildInput {
  userPrompt: string;
  motionPrompt: string;
  style: WallStyle | null;
  device: HistoryDevice;
  ratio: AspectRatioId;
  generationMode: "text_to_video" | "image_to_video";
  durationSeconds: 3 | 4 | 5;
  hasSourceImage: boolean;
}

export interface BuiltVideoPrompt {
  prompt: string;
  negativePrompt: string;
  styleVersion: number;
  builderVersion: number;
  /** The style-derived motion guidance that was actually composed. */
  styleMotionGuidance: string;
}

const SOURCE_IMAGE_GUIDANCE =
  "Animate the supplied still image. Preserve the original subject identity, face, hair, clothing, markings, silhouette, scene layout, framing and perspective. Keep the camera stable and make only the described local motion happen. Do not redraw, replace, morph or add a new subject; do not crop the subject; do not introduce a scene cut.";

const VIDEO_SAFETY_GUIDANCE =
  "Single continuous shot, natural physically plausible motion, stable subject identity, no cuts, no flash frames, no text overlays, no sudden camera shake, no violent whole-frame warp.";

const VIDEO_NEGATIVE =
  "scene cut, hard transition, morphing subject, identity drift, extra limbs, duplicated subject, flicker, frame tearing, camera shake, text, watermark, logo, blurry, low quality";

export function buildVideoPrompt(input: VideoPromptBuildInput): BuiltVideoPrompt {
  const userPrompt = input.userPrompt.trim();
  const motionPrompt = input.motionPrompt.trim();
  const style = input.style;
  const motion = resolveStyleMotionMeta(style);

  const scene =
    userPrompt ||
    (style
      ? "a cinematic scene that matches the selected style"
      : input.generationMode === "image_to_video" && input.hasSourceImage
        ? "the supplied still image"
        : "");
  if (!scene) {
    throw new PromptBuildError(
      "empty",
      "Describe the scene or choose a style first."
    );
  }

  const parts: string[] = [`Scene: ${scene}.`];
  if (input.generationMode === "text_to_video") {
    parts.push("Create a new short wallpaper video from this scene.");
  } else {
    parts.push(SOURCE_IMAGE_GUIDANCE);
  }

  let negativePrompt = VIDEO_NEGATIVE;
  let styleVersion = STYLE_PROMPT_VERSION;
  if (style) {
    const visual = resolveStyleMeta(style);
    styleVersion = style.promptVersion ?? STYLE_PROMPT_VERSION;
    if (!userPrompt.includes(style.promptTemplate)) {
      parts.push(`Visual style: ${style.promptTemplate}.`);
    }
    parts.push(
      `Palette: ${visual.palette}. Lighting: ${visual.lighting}. Texture: ${visual.texture}. Composition: ${visual.composition}.`
    );
    negativePrompt = `${visual.negativePrompt}, ${VIDEO_NEGATIVE}`;
  }

  parts.push(`${DEVICE_GUIDANCE[input.device]} Compose for a ${input.ratio} video frame.`);
  parts.push(
    `Motion: ${motion.motionGuidance}. ${
      motionPrompt ? `User motion direction: ${motionPrompt}.` : ""
    } Camera: ${motion.cameraGuidance}. Motion intensity: ${motion.intensity}. Loop intent: ${motion.loopIntent}.`
  );
  parts.push(
    `Target duration: ${input.durationSeconds} seconds. ${VIDEO_SAFETY_GUIDANCE}`
  );

  const prompt = parts.join(" ").replace(/\s+/g, " ").trim();
  if (prompt.length > MAX_VIDEO_PROMPT_LENGTH) {
    throw new PromptBuildError(
      "too-long",
      "The combined prompt is too long — shorten your description."
    );
  }

  return {
    prompt,
    negativePrompt,
    styleVersion,
    builderVersion: VIDEO_PROMPT_BUILDER_VERSION,
    styleMotionGuidance: motion.motionGuidance,
  };
}

