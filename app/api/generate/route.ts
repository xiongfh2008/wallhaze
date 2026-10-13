import { NextResponse } from "next/server";
import { findStyle } from "@/lib/styles";

/**
 * Server-side proxy for fal.ai text-to-image and image-to-image.
 * FAL_KEY lives only here — it is never returned to the browser or logged.
 *
 * API details are taken from the official model docs:
 * https://fal.ai/models/fal-ai/flux-2/klein/4b/api       (text-to-image)
 * https://fal.ai/models/fal-ai/flux-2/klein/4b/edit/api  (image-to-image)
 * (sync endpoint, `Authorization: Key <FAL_KEY>`, documented input/output schema)
 */

const FAL_ENDPOINT = "https://fal.run/fal-ai/flux-2/klein/4b";
const FAL_EDIT_ENDPOINT = `${FAL_ENDPOINT}/edit`;

/** Client-side prompt limit, enforced before composing with style templates. */
const PROMPT_MAX_LENGTH = 800;

/** Reference images are accepted as base64 data URIs (PNG/JPEG/WebP, ≤5 MB). */
const REF_ALLOWED_MIMES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
];
const REF_MAX_BYTES = 5 * 1024 * 1024;
/** Hard cap on the JSON body — data URIs inflate images by ~4/3. */
const BODY_MAX_BYTES = 10 * 1024 * 1024;
/** Instruction used when a reference image is provided without a prompt. */
const EDIT_BASE_INSTRUCTION = "Transform the reference image into a wallpaper";
const REF_DATA_URI_RE =
  /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/;

/** Official `image_size` enum values, mapped from WallHaze device types. */
const DEVICE_IMAGE_SIZES: Record<string, string> = {
  phone: "portrait_16_9",
  tablet: "portrait_4_3",
  desktop: "landscape_16_9",
};

interface GenerateRequestBody {
  prompt?: unknown;
  styleId?: unknown;
  device?: unknown;
  /** Base64 data URI of the reference image (empty/absent = text-only mode). */
  refImage?: unknown;
}

interface FalImage {
  url?: string;
  content_type?: string;
  width?: number;
  height?: number;
}

interface FalResult {
  images?: FalImage[];
  has_nsfw_concepts?: boolean[];
}

function extractFalErrorDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        typeof item === "object" && item !== null && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : String(item)
      )
      .join("; ");
  }
  return "";
}

export async function POST(request: Request) {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return NextResponse.json(
      { error: "AI generation is not configured yet. Please try again later." },
      { status: 503 }
    );
  }

  // Reject oversized bodies before parsing (guards memory, not a storage quota)
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > BODY_MAX_BYTES) {
    return NextResponse.json(
      { error: "That request is too large — please use a smaller image." },
      { status: 413 }
    );
  }

  let body: GenerateRequestBody;
  try {
    body = (await request.json()) as GenerateRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  // Validate device
  const device = typeof body.device === "string" ? body.device : "";
  const imageSize = DEVICE_IMAGE_SIZES[device];
  if (!imageSize) {
    return NextResponse.json(
      { error: "Choose a device: phone, tablet or desktop." },
      { status: 400 }
    );
  }

  // Validate prompt (optional when a style is selected)
  const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (userPrompt.length > PROMPT_MAX_LENGTH) {
    return NextResponse.json(
      {
        error: `Your prompt is too long — please keep it under ${PROMPT_MAX_LENGTH} characters.`,
      },
      { status: 400 }
    );
  }

  // Validate style
  const styleId = typeof body.styleId === "string" ? body.styleId : "";
  const style = styleId ? findStyle(styleId) : undefined;
  if (styleId && !style) {
    return NextResponse.json(
      { error: "That style is not available. Please pick another one." },
      { status: 400 }
    );
  }

  // Validate the optional reference image (base64 data URI)
  const rawRef = typeof body.refImage === "string" ? body.refImage : "";
  let refDataUri: string | null = null;
  if (rawRef) {
    const mime = /^data:([a-z]+\/[a-z0-9.+-]+);base64,/.exec(rawRef)?.[1] ?? "";
    if (mime && !REF_ALLOWED_MIMES.includes(mime)) {
      return NextResponse.json(
        { error: "Unsupported image format — use PNG, JPEG or WebP." },
        { status: 400 }
      );
    }
    const match = REF_DATA_URI_RE.exec(rawRef);
    if (!match) {
      return NextResponse.json(
        {
          error:
            "That reference image could not be read. Please re-upload it.",
        },
        { status: 400 }
      );
    }
    const decodedBytes = Math.floor((match[2].length * 3) / 4);
    if (decodedBytes > REF_MAX_BYTES) {
      return NextResponse.json(
        { error: "Reference image is too large — please keep it under 5 MB." },
        { status: 413 }
      );
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
    return NextResponse.json(
      { error: "Add a prompt or pick a style first." },
      { status: 400 }
    );
  }
  const finalPrompt = parts.join(", ");

  // Reference image → official image-to-image endpoint; otherwise text-to-image.
  const endpoint = refDataUri ? FAL_EDIT_ENDPOINT : FAL_ENDPOINT;
  const falPayload: Record<string, unknown> = {
    prompt: finalPrompt,
    image_size: imageSize,
    num_images: 1,
    enable_safety_checker: true,
    output_format: "png",
  };
  if (refDataUri) falPayload.image_urls = [refDataUri];

  // Call fal.ai (sync endpoint — klein 4B is a fast 4-step model)
  let falResponse: Response;
  try {
    falResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(falPayload),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    console.error(
      "[generate] fal request failed:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Could not reach the image service. Please try again." },
      { status: 502 }
    );
  }

  if (!falResponse.ok) {
    const errorBody = (await falResponse.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    const detail = errorBody ? extractFalErrorDetail(errorBody.detail) : "";
    // Log status + provider message only — never credentials or request bodies.
    console.error(
      `[generate] fal responded ${falResponse.status}${detail ? `: ${detail}` : ""}`
    );
    return NextResponse.json(
      {
        error:
          falResponse.status === 429
            ? "The image service is busy right now. Please try again in a moment."
            : "Image generation failed. Please try again.",
      },
      { status: 502 }
    );
  }

  const result = (await falResponse.json()) as FalResult;

  if (result.has_nsfw_concepts?.[0] === true) {
    return NextResponse.json(
      {
        error:
          "Your prompt was flagged by the safety checker. Please adjust it and try again.",
      },
      { status: 422 }
    );
  }

  const image = result.images?.[0];
  if (!image?.url) {
    return NextResponse.json(
      { error: "The image service returned no image. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    imageUrl: image.url,
    width: image.width ?? null,
    height: image.height ?? null,
    contentType: image.content_type ?? null,
  });
}
