import { NextResponse } from "next/server";
import { findStyle } from "@/lib/styles";
import {
  findSizePreset,
  isAspectRatioId,
  isHistoryDevice,
  isRatioAllowedForDevice,
  isValidPresetDimensions,
  resolveImageSize,
  type SizePreset,
} from "@/lib/sizes";
import {
  checkDailyQuota,
  checkGlobalDailyBudget,
  checkShortWindow,
  releaseConcurrencySlot,
  tryAcquireConcurrencySlot,
} from "@/lib/server/rate-limit";
import {
  checkRequestOrigin,
  getClientKey,
  isJsonContentType,
  readJsonBody,
} from "@/lib/server/request-guard";

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

interface GenerateRequestBody {
  prompt?: unknown;
  styleId?: unknown;
  device?: unknown;
  /**
   * Optional aspect-ratio id ("9:16" | "3:4" | "1:1" | "4:3" | "16:9").
   * Absent/null → the device's preset ratio, keeping legacy requests
   * unchanged. Only verified fal.ai enum sizes are ever sent upstream —
   * clients can never pass raw width/height objects through this route.
   */
  aspectRatio?: unknown;
  /**
   * Optional built-in size-preset id (see lib/sizes.ts). When valid, the
   * server resolves the size itself from the shared config and sends an
   * official custom {width,height} object upstream — client-supplied
   * dimensions are never trusted.
   */
  sizePresetId?: unknown;
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

/**
 * Magic-byte check: the decoded file header must match the MIME type
 * declared in the Data URI. Signatures are format-mandated, so valid
 * PNG/JPEG/WebP files always start with them (no false rejections).
 */
function matchesDeclaredImageType(mime: string, bytes: Buffer): boolean {
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
 * One structured log line per request outcome (stage 4.4-A basic logging).
 * Records the request id, result, HTTP status, rejection reason and duration.
 * Never logs FAL_KEY, prompts, reference-image data or request bodies.
 */
function logGenerateOutcome(
  outcome: string,
  status: number,
  startedAt: number,
  requestId: string
): void {
  console.log(
    `[generate] ${JSON.stringify({
      id: requestId,
      outcome,
      status,
      durationMs: Date.now() - startedAt,
    })}`
  );
}

/** Retry-After header (seconds) for rate-limit responses, or undefined. */
function retryAfterHeaders(retryAfterSeconds?: number):
  | { "Retry-After": string }
  | undefined {
  return retryAfterSeconds === undefined
    ? undefined
    : { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  // Safe, non-identifying request id — correlates this request's log lines
  // without using any client-supplied value.
  const requestId = crypto.randomUUID();

  // ---- Stage 4.4-A guards: every check below runs BEFORE the upstream call ----

  // 1) Request-source guard (Origin / Fetch Metadata). Not authentication —
  //    a scripted client can forge these headers — but it stops browser-based
  //    cross-site requests. Origin-less requests still pass every check below.
  const originCheck = checkRequestOrigin(request);
  if (!originCheck.allowed) {
    logGenerateOutcome(`rejected:${originCheck.reason}`, 403, startedAt, requestId);
    return NextResponse.json(
      { error: "Request origin is not allowed" },
      { status: 403 }
    );
  }

  // 2) Route-local pause switch. OFF by default so local testing always
  //    works; operators pause generation by setting GENERATION_PAUSED=1 (or
  //    "true") in the environment. No config file is required.
  const generationPaused = ["1", "true"].includes(
    (process.env.GENERATION_PAUSED ?? "").toLowerCase()
  );
  if (generationPaused) {
    logGenerateOutcome("paused", 503, startedAt, requestId);
    return NextResponse.json(
      { error: "Image generation is paused by the server. Please try again later." },
      { status: 503 }
    );
  }

  // 3) Content-Type must be JSON before any body byte is read. Also stops
  //    no-preflight cross-site form/text submissions.
  if (!isJsonContentType(request)) {
    logGenerateOutcome("rejected:content-type", 415, startedAt, requestId);
    return NextResponse.json(
      { error: "Unsupported content type — expected application/json." },
      { status: 415 }
    );
  }

  // 4) Short-window rate limit. Until a trusted proxy identity exists
  //    (TRUST_PROXY — see lib/server/request-guard.ts), ALL requests share
  //    one conservative bucket, so "per-IP" limits below are effectively
  //    global. Every request reaching this line is counted.
  const clientKey = getClientKey(request);
  const shortWindow = checkShortWindow(clientKey);
  if (!shortWindow.allowed) {
    logGenerateOutcome("rejected:short-window", 429, startedAt, requestId);
    return NextResponse.json(
      { error: "Too many requests — please slow down and try again in a moment." },
      { status: 429, headers: retryAfterHeaders(shortWindow.retryAfterSeconds) }
    );
  }

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

  // Read the body through the streaming cap — the actual byte count is
  // enforced on the stream (Content-Length alone can lie), and the stream is
  // cancelled as soon as the limit is exceeded.
  const parsed = await readJsonBody(request, BODY_MAX_BYTES);
  if (!parsed.ok) {
    logGenerateOutcome(
      parsed.status === 413 ? "rejected:body-too-large" : "rejected:body-invalid",
      parsed.status,
      startedAt,
      requestId
    );
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const body = parsed.body as GenerateRequestBody;

  // Validate device
  const device = typeof body.device === "string" ? body.device : "";
  if (!isHistoryDevice(device)) {
    logGenerateOutcome("rejected:validation:device", 400, startedAt, requestId);
    return NextResponse.json(
      { error: "Choose a device: phone, tablet or desktop." },
      { status: 400 }
    );
  }

  // Validate the optional size preset BEFORE the ratio: a valid preset
  // implies its own ratio and dimensions, all re-resolved from the shared
  // config — the client's ids only ever select among built-in entries.
  const rawPresetId = body.sizePresetId;
  let sizePreset: SizePreset | null = null;
  if (rawPresetId != null) {
    sizePreset = findSizePreset(rawPresetId);
    if (!sizePreset) {
      logGenerateOutcome("rejected:validation:preset", 400, startedAt, requestId);
      return NextResponse.json(
        { error: "That size preset is not available. Please pick another one." },
        { status: 400 }
      );
    }
    if (sizePreset.device !== device) {
      logGenerateOutcome("rejected:validation:preset-device", 400, startedAt, requestId);
      return NextResponse.json(
        { error: "That size preset is not available for this device." },
        { status: 400 }
      );
    }
    // The preset matrix is code-owned, but the server still enforces the
    // same conservative bound as the UI — belt and braces until fal.ai's
    // real min/max limits for klein 4b are verified.
    if (!isValidPresetDimensions(sizePreset.width, sizePreset.height)) {
      logGenerateOutcome("rejected:validation:preset-dimensions", 400, startedAt, requestId);
      return NextResponse.json(
        { error: "That size preset is outside the supported size range." },
        { status: 400 }
      );
    }
  }

  // Validate the optional aspect ratio. Absent/null → device preset ratio
  // (the exact mapping used before ratios existed, so old requests keep
  // their behavior). An explicit unsupported ratio is a 400 — never a
  // silent fallback to another size.
  const rawRatio = body.aspectRatio;
  if (rawRatio != null && !isAspectRatioId(rawRatio)) {
    logGenerateOutcome("rejected:validation:ratio", 400, startedAt, requestId);
    return NextResponse.json(
      { error: "That aspect ratio is not available. Please pick another one." },
      { status: 400 }
    );
  }
  const ratio = isAspectRatioId(rawRatio) ? rawRatio : undefined;
  if (ratio && !isRatioAllowedForDevice(device, ratio)) {
    logGenerateOutcome("rejected:validation:ratio-device", 400, startedAt, requestId);
    return NextResponse.json(
      { error: `The ${ratio} ratio is not available for this device.` },
      { status: 400 }
    );
  }
  // A preset and an explicit ratio must agree — never generate a size whose
  // shape contradicts what the user picked.
  if (sizePreset && ratio && ratio !== sizePreset.ratio) {
    logGenerateOutcome("rejected:validation:ratio-preset", 400, startedAt, requestId);
    return NextResponse.json(
      {
        error:
          "The selected size preset does not match the selected aspect ratio.",
      },
      { status: 400 }
    );
  }
  // Valid preset → official custom {width,height} object (schema-confirmed
  // for both endpoints). Otherwise the enum mapping, unchanged since the
  // aspect-ratio feature shipped.
  const imageSize: string | { width: number; height: number } | null =
    sizePreset
      ? { width: sizePreset.width, height: sizePreset.height }
      : resolveImageSize(device, ratio);
  if (!imageSize) {
    // Unreachable after the validation above — defensive guard only.
    logGenerateOutcome("rejected:validation:image-size", 500, startedAt, requestId);
    return NextResponse.json(
      { error: "Could not resolve an image size. Please try again." },
      { status: 500 }
    );
  }

  // Validate prompt (optional when a style is selected)
  const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (userPrompt.length > PROMPT_MAX_LENGTH) {
    logGenerateOutcome("rejected:validation:prompt-length", 400, startedAt, requestId);
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
    logGenerateOutcome("rejected:validation:style", 400, startedAt, requestId);
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
      logGenerateOutcome("rejected:validation:ref-mime", 400, startedAt, requestId);
      return NextResponse.json(
        { error: "Unsupported image format — use PNG, JPEG or WebP." },
        { status: 400 }
      );
    }
    const match = REF_DATA_URI_RE.exec(rawRef);
    if (!match) {
      logGenerateOutcome("rejected:validation:ref-format", 400, startedAt, requestId);
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
      logGenerateOutcome("rejected:validation:ref-size", 413, startedAt, requestId);
      return NextResponse.json(
        { error: "Reference image is too large — please keep it under 5 MB." },
        { status: 413 }
      );
    }
    // A well-formed Data URI never proves the content is a real image —
    // verify the decoded header matches the declared type before forwarding.
    const header = Buffer.from(match[2], "base64");
    if (!matchesDeclaredImageType(mime, header)) {
      logGenerateOutcome("rejected:validation:ref-magic", 400, startedAt, requestId);
      return NextResponse.json(
        {
          error:
            "The reference image is invalid or its format does not match the declared type.",
        },
        { status: 400 }
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
    logGenerateOutcome("rejected:validation:empty-input", 400, startedAt, requestId);
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

  // ---- Stage 4.4-A: quota, request-count budget and concurrency slot ----
  // All three run AFTER validation and BEFORE the upstream fetch, so nothing
  // that could cost money is ever reached by a rejected request.
  // "Submission" semantics: counted even if the upstream call later fails
  // (a failed call may already have cost money; conservative and simple).

  // 4) Per-client daily quota (UTC day). With the shared bucket this is
  //    effectively a global daily cap until TRUST_PROXY exists.
  const dailyQuota = checkDailyQuota(clientKey);
  if (!dailyQuota.allowed) {
    logGenerateOutcome("rejected:daily-quota", 429, startedAt, requestId);
    return NextResponse.json(
      { error: "You've reached today's generation limit. Please try again tomorrow." },
      { status: 429, headers: retryAfterHeaders(dailyQuota.retryAfterSeconds) }
    );
  }

  // 5) Global daily request budget — a REQUEST-COUNT circuit breaker, not a
  //    real-cost budget (actual fal.ai spending is not measured here).
  const globalBudget = checkGlobalDailyBudget();
  if (!globalBudget.allowed) {
    logGenerateOutcome("rejected:daily-budget", 503, startedAt, requestId);
    return NextResponse.json(
      { error: "The image service has reached today's request limit. Please try again tomorrow." },
      { status: 503, headers: retryAfterHeaders(globalBudget.retryAfterSeconds) }
    );
  }

  // 6) Concurrency slot — acquired last, released in the finally below.
  if (!tryAcquireConcurrencySlot()) {
    logGenerateOutcome("rejected:concurrency", 429, startedAt, requestId);
    return NextResponse.json(
      { error: "The image service is busy right now. Please try again in a moment." },
      { status: 429 }
    );
  }

  // Call fal.ai (sync endpoint — klein 4B is a fast 4-step model).
  // The slot is held for the whole upstream interaction (fetch + response
  // read) and released in `finally`, so every exit path — success, provider
  // error, timeout, client disconnect — frees its slot. Aborting the local
  // request does NOT cancel a started fal.ai task or waive its cost.
  let falResponse: Response;
  let result: FalResult;
  try {
    try {
      falResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Key ${falKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(falPayload),
        // Merge the client disconnect signal with the hard upstream timeout —
        // no automatic retry on either (a retry could double-bill).
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
      });
    } catch (error) {
      // Distinguish a client disconnect from the 120s timeout without
      // changing the upstream semantics or the response body. Aborting the
      // local request does NOT cancel a started fal.ai task or waive its cost.
      const aborted = error instanceof Error && error.name === "AbortError";
      const outcome = aborted
        ? request.signal.aborted
          ? "upstream:client-aborted"
          : "upstream:timeout"
        : "upstream:failed";
      console.error(
        "[generate] fal request failed:",
        error instanceof Error ? error.message : error
      );
      logGenerateOutcome(outcome, 502, startedAt, requestId);
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
      logGenerateOutcome("upstream:error", 502, startedAt, requestId);
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

    // 2xx status — parse the body defensively: gateways can occasionally return
    // non-JSON payloads even on success.
    try {
      result = (await falResponse.json()) as FalResult;
    } catch {
      logGenerateOutcome("upstream:invalid-response", 502, startedAt, requestId);
      return NextResponse.json(
        {
          error:
            "The image service returned an invalid response. Please try again.",
        },
        { status: 502 }
      );
    }
  } finally {
    releaseConcurrencySlot();
  }

  if (result.has_nsfw_concepts?.[0] === true) {
    logGenerateOutcome("upstream:nsfw-flagged", 422, startedAt, requestId);
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
    logGenerateOutcome("upstream:no-image", 502, startedAt, requestId);
    return NextResponse.json({ error: "The image service returned no image. Please try again." }, { status: 502 });
  }

  logGenerateOutcome("success", 200, startedAt, requestId);
  return NextResponse.json({
    imageUrl: image.url,
    width: image.width ?? null,
    height: image.height ?? null,
    contentType: image.content_type ?? null,
  });
}
