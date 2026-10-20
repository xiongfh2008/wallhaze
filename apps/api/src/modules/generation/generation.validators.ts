import {
  findSizePreset,
  isAspectRatioId,
  isHistoryDevice,
  isRatioAllowedForDevice,
  isValidPresetDimensions,
  resolveImageSize,
  type SizePreset,
} from "../../catalog/sizes.js";
import { findStyle, type WallStyle } from "../../catalog/styles.js";

/**
 * Domain validation + prompt composition for POST /v1/generations.
 *
 * Faithful migration of the legacy `app/api/generate/route.ts` validation
 * stage: same order, same limits, same client-facing messages — so every
 * legacy 400/413 copy keeps working against the new backend. Only the
 * transport (Next.js Request → Fastify) and the error envelope change.
 */

/** Client-side prompt limit, enforced before composing with style templates. */
export const PROMPT_MAX_LENGTH = 800;

/** Reference images are accepted as base64 data URIs (PNG/JPEG/WebP, ≤5 MB). */
export const REF_ALLOWED_MIMES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
];
export const REF_MAX_BYTES = 5 * 1024 * 1024;
/** Instruction used when a reference image is provided without a prompt. */
export const EDIT_BASE_INSTRUCTION =
  "Transform the reference image into a wallpaper";
const REF_DATA_URI_RE =
  /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/;

/** The generation request exactly as the legacy route received it. */
export interface GenerateRequestBody {
  prompt?: unknown;
  styleId?: unknown;
  device?: unknown;
  aspectRatio?: unknown;
  sizePresetId?: unknown;
  refImage?: unknown;
}

/** Everything the provider needs, fully resolved server-side. */
export interface ValidatedGeneration {
  /** Composed final prompt (user prompt and/or style template). */
  finalPrompt: string;
  /** Official fal.ai image_size enum OR the preset's custom {width,height}. */
  imageSize: string | { width: number; height: number };
  /** Normalized reference data URI, or null in text-to-image mode. */
  refDataUri: string | null;
  style: WallStyle | null;
}

export type ValidationResult =
  | { ok: true; value: ValidatedGeneration }
  | { ok: false; status: 400 | 413 | 500; message: string; logOutcome: string };

/**
 * Magic-byte check: the decoded file header must match the MIME type
 * declared in the Data URI. Signatures are format-mandated, so valid
 * PNG/JPEG/WebP files always start with them (no false rejections).
 */
export function matchesDeclaredImageType(
  mime: string,
  bytes: Buffer
): boolean {
  if (mime === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mime === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (mime === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes.toString("latin1", 0, 4) === "RIFF" &&
      bytes.toString("latin1", 8, 12) === "WEBP"
    );
  }
  return false;
}

/**
 * Validates the parsed body and composes the final upstream inputs.
 * Validation order mirrors the legacy route exactly (device → preset →
 * ratio → prompt → style → reference image → composition), so test
 * expectations carry over one to one.
 */
export function validateGenerateBody(body: unknown): ValidationResult {
  const input = (body ?? {}) as GenerateRequestBody;

  // Validate device
  const device = typeof input.device === "string" ? input.device : "";
  if (!isHistoryDevice(device)) {
    return {
      ok: false,
      status: 400,
      message: "Choose a device: phone, tablet or desktop.",
      logOutcome: "rejected:validation:device",
    };
  }

  // Validate the optional size preset BEFORE the ratio: a valid preset
  // implies its own ratio and dimensions, all re-resolved from the shared
  // config — the client's ids only ever select among built-in entries.
  const rawPresetId = input.sizePresetId;
  let sizePreset: SizePreset | null = null;
  if (rawPresetId != null) {
    sizePreset = findSizePreset(rawPresetId);
    if (!sizePreset) {
      return {
        ok: false,
        status: 400,
        message: "That size preset is not available. Please pick another one.",
        logOutcome: "rejected:validation:preset",
      };
    }
    if (sizePreset.device !== device) {
      return {
        ok: false,
        status: 400,
        message: "That size preset is not available for this device.",
        logOutcome: "rejected:validation:preset-device",
      };
    }
    // The preset matrix is code-owned, but the server still enforces the
    // same conservative bound as the UI — belt and braces.
    if (!isValidPresetDimensions(sizePreset.width, sizePreset.height)) {
      return {
        ok: false,
        status: 400,
        message: "That size preset is outside the supported size range.",
        logOutcome: "rejected:validation:preset-dimensions",
      };
    }
  }

  // Validate the optional aspect ratio. Absent/null → device preset ratio
  // (the exact mapping used before ratios existed). An explicit unsupported
  // ratio is a 400 — never a silent fallback to another size.
  const rawRatio = input.aspectRatio;
  if (rawRatio != null && !isAspectRatioId(rawRatio)) {
    return {
      ok: false,
      status: 400,
      message:
        "That aspect ratio is not available. Please pick another one.",
      logOutcome: "rejected:validation:ratio",
    };
  }
  const ratio = isAspectRatioId(rawRatio) ? rawRatio : undefined;
  if (ratio && !isRatioAllowedForDevice(device, ratio)) {
    return {
      ok: false,
      status: 400,
      message: `The ${ratio} ratio is not available for this device.`,
      logOutcome: "rejected:validation:ratio-device",
    };
  }
  // A preset and an explicit ratio must agree — never generate a size whose
  // shape contradicts what the user picked.
  if (sizePreset && ratio && ratio !== sizePreset.ratio) {
    return {
      ok: false,
      status: 400,
      message:
        "The selected size preset does not match the selected aspect ratio.",
      logOutcome: "rejected:validation:ratio-preset",
    };
  }
  // Valid preset → official custom {width,height} object (schema-confirmed
  // for both endpoints). Otherwise the enum mapping.
  const imageSize: string | { width: number; height: number } | null =
    sizePreset
      ? { width: sizePreset.width, height: sizePreset.height }
      : resolveImageSize(device, ratio);
  if (!imageSize) {
    // Unreachable after the validation above — defensive guard only.
    return {
      ok: false,
      status: 500,
      message: "Could not resolve an image size. Please try again.",
      logOutcome: "rejected:validation:image-size",
    };
  }

  // Validate prompt (optional when a style is selected)
  const userPrompt =
    typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (userPrompt.length > PROMPT_MAX_LENGTH) {
    return {
      ok: false,
      status: 400,
      message: `Your prompt is too long — please keep it under ${PROMPT_MAX_LENGTH} characters.`,
      logOutcome: "rejected:validation:prompt-length",
    };
  }

  // Validate style
  const styleId = typeof input.styleId === "string" ? input.styleId : "";
  const style = styleId ? findStyle(styleId) : undefined;
  if (styleId && !style) {
    return {
      ok: false,
      status: 400,
      message: "That style is not available. Please pick another one.",
      logOutcome: "rejected:validation:style",
    };
  }

  // Validate the optional reference image (base64 data URI)
  const rawRef = typeof input.refImage === "string" ? input.refImage : "";
  let refDataUri: string | null = null;
  if (rawRef) {
    const mime = /^data:([a-z]+\/[a-z0-9.+-]+);base64,/.exec(rawRef)?.[1] ?? "";
    if (mime && !REF_ALLOWED_MIMES.includes(mime)) {
      return {
        ok: false,
        status: 400,
        message: "Unsupported image format — use PNG, JPEG or WebP.",
        logOutcome: "rejected:validation:ref-mime",
      };
    }
    const match = REF_DATA_URI_RE.exec(rawRef);
    if (!match) {
      return {
        ok: false,
        status: 400,
        message: "That reference image could not be read. Please re-upload it.",
        logOutcome: "rejected:validation:ref-format",
      };
    }
    const decodedBytes = Math.floor((match[2].length * 3) / 4);
    if (decodedBytes > REF_MAX_BYTES) {
      return {
        ok: false,
        status: 413,
        message: "Reference image is too large — please keep it under 5 MB.",
        logOutcome: "rejected:validation:ref-size",
      };
    }
    // A well-formed Data URI never proves the content is a real image —
    // verify the decoded header matches the declared type before forwarding.
    const header = Buffer.from(match[2], "base64");
    if (!matchesDeclaredImageType(mime, header)) {
      return {
        ok: false,
        status: 400,
        message:
          "The reference image is invalid or its format does not match the declared type.",
        logOutcome: "rejected:validation:ref-magic",
      };
    }
    refDataUri = match[0];
  }

  // Compose the final prompt: user prompt and/or style template.
  // With a reference image, always include an edit instruction so the model
  // treats the upload as the base, not an unrelated attachment.
  const parts = [
    userPrompt || (refDataUri ? EDIT_BASE_INSTRUCTION : ""),
    style?.promptTemplate ?? "",
  ].filter(Boolean);
  if (parts.length === 0) {
    return {
      ok: false,
      status: 400,
      message: "Add a prompt or pick a style first.",
      logOutcome: "rejected:validation:empty-input",
    };
  }

  return {
    ok: true,
    value: {
      finalPrompt: parts.join(", "),
      imageSize,
      refDataUri,
      style: style ?? null,
    },
  };
}
