import type {
  AspectRatioId,
  DeviceId,
  VideoDurationSeconds,
} from "@wallhaze/contracts";
import { isHistoryDevice } from "../../catalog/sizes.js";
import { findStyle, type WallStyle } from "../../catalog/styles.js";
import {
  buildVideoPrompt,
  MOTION_PROMPT_MAX_LENGTH,
  PromptBuildError,
} from "../../catalog/prompt-builder.js";
import {
  REF_ALLOWED_MIMES,
  REF_MAX_BYTES,
  PROMPT_MAX_LENGTH,
  matchesDeclaredImageType,
} from "./generation.validators.js";
import {
  isVideoDurationSupported,
  videoModePricing,
  type VideoGenerationMode,
} from "../../business/video-pricing.js";
import type { GenerationMode } from "../../business/provider-mode.js";

const SOURCE_DATA_URI_RE =
  /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/;

export interface VideoGenerateRequestBody {
  mediaType?: unknown;
  generationMode?: unknown;
  prompt?: unknown;
  motionPrompt?: unknown;
  styleId?: unknown;
  device?: unknown;
  aspectRatio?: unknown;
  durationSeconds?: unknown;
  sourceCreationId?: unknown;
  refImage?: unknown;
  width?: unknown;
  height?: unknown;
  sizePresetId?: unknown;
  /** Server-resolved source image for a My Creations selection (internal). */
  _sourceImageDataUri?: unknown;
}

export interface ValidatedVideoGeneration {
  mediaType: "video";
  generationMode: VideoGenerationMode;
  durationSeconds: VideoDurationSeconds;
  aspectRatio: AspectRatioId;
  device: DeviceId;
  style: WallStyle | null;
  styleId: string | null;
  finalPrompt: string;
  motionPrompt: string;
  negativePrompt: string;
  promptVersion: number;
  builderVersion: number;
  /** Validated data URI, or null for text-to-video. */
  sourceImageDataUri: string | null;
  /** Provenance when the source came from an owned creation. */
  sourceCreationId: string | null;
}

export type VideoValidationResult =
  | { ok: true; value: ValidatedVideoGeneration }
  | { ok: false; status: 400 | 413; message: string; logOutcome: string };

function defaultRatio(device: DeviceId): AspectRatioId {
  if (device === "phone") return "9:16";
  if (device === "desktop") return "16:9";
  return "1:1";
}

/**
 * Validates a video request against the runtime provider capability matrix.
 * The client never selects a duration/ratio the active mode does not expose.
 */
export function validateVideoBody(
  body: unknown,
  runtime: GenerationMode
): VideoValidationResult {
  const input = (body ?? {}) as VideoGenerateRequestBody;
  if (input.mediaType !== "video") {
    return {
      ok: false,
      status: 400,
      message: "A video request must declare mediaType=video.",
      logOutcome: "rejected:video:media-type",
    };
  }
  const generationMode =
    input.generationMode === "text_to_video" ||
    input.generationMode === "image_to_video"
      ? input.generationMode
      : null;
  if (!generationMode) {
    return {
      ok: false,
      status: 400,
      message: "Choose text-to-video or image-to-video.",
      logOutcome: "rejected:video:mode",
    };
  }
  const modePricing = videoModePricing(generationMode, runtime);
  if (runtime === "disabled") {
    return {
      ok: false,
      status: 400,
      message: "Live wallpaper generation is not configured yet.",
      logOutcome: "rejected:video:disabled",
    };
  }

  const device = typeof input.device === "string" ? input.device : "";
  if (!isHistoryDevice(device)) {
    return {
      ok: false,
      status: 400,
      message: "Choose a device: phone, tablet or desktop.",
      logOutcome: "rejected:video:device",
    };
  }

  if (
    input.width !== undefined ||
    input.height !== undefined ||
    input.sizePresetId !== undefined
  ) {
    return {
      ok: false,
      status: 400,
      message: "Video output follows provider ratios; custom sizes are not supported.",
      logOutcome: "rejected:video:custom-size",
    };
  }

  const rawDuration = input.durationSeconds;
  if (
    typeof rawDuration !== "number" ||
    !isVideoDurationSupported(runtime, generationMode, rawDuration)
  ) {
    return {
      ok: false,
      status: 400,
      message:
        modePricing.durations.length === 1
          ? `This provider supports ${modePricing.durations[0]}-second videos only.`
          : "Choose a supported video duration.",
      logOutcome: "rejected:video:duration",
    };
  }
  const durationSeconds = rawDuration as VideoDurationSeconds;

  const rawRatio = input.aspectRatio;
  const aspectRatio = rawRatio == null
    ? defaultRatio(device)
    : (rawRatio as AspectRatioId);
  if (!modePricing.aspectRatios.includes(aspectRatio)) {
    return {
      ok: false,
      status: 400,
      message: `The ${String(rawRatio)} ratio is not supported for this video mode.`,
      logOutcome: "rejected:video:ratio",
    };
  }

  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (prompt.length > PROMPT_MAX_LENGTH) {
    return {
      ok: false,
      status: 400,
      message: `Your prompt is too long — please keep it under ${PROMPT_MAX_LENGTH} characters.`,
      logOutcome: "rejected:video:prompt-length",
    };
  }
  const motionPrompt =
    typeof input.motionPrompt === "string" ? input.motionPrompt.trim() : "";
  if (motionPrompt.length > MOTION_PROMPT_MAX_LENGTH) {
    return {
      ok: false,
      status: 400,
      message: `Motion instructions are too long — keep them under ${MOTION_PROMPT_MAX_LENGTH} characters.`,
      logOutcome: "rejected:video:motion-length",
    };
  }

  const styleId = typeof input.styleId === "string" ? input.styleId : "";
  const style = styleId ? findStyle(styleId) : undefined;
  if (styleId && !style) {
    return {
      ok: false,
      status: 400,
      message: "That style is not available. Please pick another one.",
      logOutcome: "rejected:video:style",
    };
  }
  if (style?.enabled === false) {
    return {
      ok: false,
      status: 400,
      message: "That style is not available. Please pick another one.",
      logOutcome: "rejected:video:style-disabled",
    };
  }
  if (style?.supportedMediaTypes && !style.supportedMediaTypes.includes("video")) {
    return {
      ok: false,
      status: 400,
      message: "That style is not available for live wallpapers.",
      logOutcome: "rejected:video:style-media",
    };
  }

  const sourceCreationId =
    typeof input.sourceCreationId === "string" && input.sourceCreationId.trim()
      ? input.sourceCreationId.trim()
      : null;
  if (sourceCreationId && sourceCreationId.length > 128) {
    return {
      ok: false,
      status: 400,
      message: "That creation reference is invalid.",
      logOutcome: "rejected:video:source-id",
    };
  }

  const uploadedRef =
    typeof input.refImage === "string" ? input.refImage : "";
  const internalSourceRef =
    typeof input._sourceImageDataUri === "string"
      ? input._sourceImageDataUri
      : "";
  const rawRef = uploadedRef || internalSourceRef;
  let sourceImageDataUri: string | null = null;
  if (rawRef) {
    const mime = /^data:([a-z]+\/[a-z0-9.+-]+);base64,/.exec(rawRef)?.[1] ?? "";
    if (mime && !REF_ALLOWED_MIMES.includes(mime)) {
      return {
        ok: false,
        status: 400,
        message: "Unsupported source image format — use PNG, JPEG or WebP.",
        logOutcome: "rejected:video:source-mime",
      };
    }
    const match = SOURCE_DATA_URI_RE.exec(rawRef);
    if (!match) {
      return {
        ok: false,
        status: 400,
        message: "That source image could not be read. Please re-upload it.",
        logOutcome: "rejected:video:source-format",
      };
    }
    const decodedBytes = Math.floor((match[2].length * 3) / 4);
    if (decodedBytes > REF_MAX_BYTES) {
      return {
        ok: false,
        status: 413,
        message: "Source image is too large — please keep it under 5 MB.",
        logOutcome: "rejected:video:source-size",
      };
    }
    const header = Buffer.from(match[2], "base64");
    if (!matchesDeclaredImageType(mime, header)) {
      return {
        ok: false,
        status: 400,
        message: "The source image is invalid or its format does not match.",
        logOutcome: "rejected:video:source-magic",
      };
    }
    sourceImageDataUri = match[0];
  }

  if (generationMode === "text_to_video") {
    if (sourceCreationId || sourceImageDataUri) {
      return {
        ok: false,
        status: 400,
        message: "Text-to-video does not accept a source image.",
        logOutcome: "rejected:video:t2v-source",
      };
    }
    if (!prompt && !style) {
      return {
        ok: false,
        status: 400,
        message: "Describe the scene or choose a style first.",
        logOutcome: "rejected:video:empty",
      };
    }
  } else {
    // `_sourceImageDataUri` is the server-resolved bytes for a My Creations
    // selection; a client may not combine a creation id with an uploaded
    // refImage. The internal pair is valid and must survive worker revalidation.
    if (sourceCreationId && uploadedRef) {
      return {
        ok: false,
        status: 400,
        message: "Choose either one of your creations or an uploaded image, not both.",
        logOutcome: "rejected:video:source-both",
      };
    }
    if (!sourceCreationId && !sourceImageDataUri) {
      return {
        ok: false,
        status: 400,
        message: "Choose a source image from My Creations or upload one.",
        logOutcome: "rejected:video:source-missing",
      };
    }
    if (!motionPrompt && !style) {
      return {
        ok: false,
        status: 400,
        message: "Add motion instructions or choose a style first.",
        logOutcome: "rejected:video:motion-empty",
      };
    }
  }

  try {
    const built = buildVideoPrompt({
      userPrompt: prompt,
      motionPrompt,
      style: style ?? null,
      device,
      ratio: aspectRatio,
      generationMode,
      durationSeconds,
      hasSourceImage: Boolean(sourceCreationId || sourceImageDataUri),
    });
    return {
      ok: true,
      value: {
        mediaType: "video",
        generationMode,
        durationSeconds,
        aspectRatio,
        device,
        style: style ?? null,
        styleId: style?.id ?? null,
        finalPrompt: built.prompt,
        motionPrompt,
        negativePrompt: built.negativePrompt,
        promptVersion: built.styleVersion,
        builderVersion: built.builderVersion,
        sourceImageDataUri,
        sourceCreationId,
      },
    };
  } catch (error) {
    if (error instanceof PromptBuildError) {
      return {
        ok: false,
        status: 400,
        message: error.message,
        logOutcome: "rejected:video:prompt-build",
      };
    }
    return {
      ok: false,
      status: 400,
      message: "Could not prepare the video prompt. Please try again.",
      logOutcome: "rejected:video:prompt",
    };
  }
}
