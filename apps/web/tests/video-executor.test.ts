import { afterEach, describe, expect, it, vi } from "vitest";
import { createVideoJobExecutor } from "@/lib/studio/video-executor";
import { buildVideoGenerationRequest } from "@/lib/studio/video-request";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const request = buildVideoGenerationRequest({
  prompt: "dreamy stars",
  motionPrompt: "slow shimmer",
  styleId: "anime-fantasy",
  device: "phone",
  ratio: "9:16",
  durationSeconds: 5,
  sourceCreationId: null,
  refImageUrl: null,
});

describe("video generation request builder", () => {
  it("defaults to text-to-video without a source and keeps provider-limited fields", () => {
    expect(request).toMatchObject({
      mediaType: "video",
      generationMode: "text_to_video",
      durationSeconds: 5,
      aspectRatio: "9:16",
      styleId: "anime-fantasy",
    });
    expect("refImage" in request).toBe(false);
    expect("sourceCreationId" in request).toBe(false);
  });

  it("switches to image-to-video and sends exactly one source reference", () => {
    const creation = buildVideoGenerationRequest({
      prompt: "",
      motionPrompt: "petals fall",
      styleId: "anime",
      device: "phone",
      ratio: "9:16",
      durationSeconds: 5,
      sourceCreationId: "job-1",
      refImageUrl: "data:image/png;base64,abc",
    });
    expect(creation).toMatchObject({
      mediaType: "video",
      generationMode: "image_to_video",
      sourceCreationId: "job-1",
    });
    expect("refImage" in creation).toBe(false);
  });
});

describe("video job executor", () => {
  it("polls an async video job and returns signed video, poster and download URLs", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.test");
    let polls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/generations/jobs")) {
        return jsonResponse({ jobId: "video-1", status: "queued", priceCredits: 60, mediaType: "video" }, 202);
      }
      polls += 1;
      if (polls < 2) {
        return jsonResponse({
          jobId: "video-1", status: "running", errorCode: null, priceCredits: 60,
          imageUrl: null, videoUrl: null, posterUrl: null, durationSeconds: 5,
          width: null, height: null, mime: null, mock: true, createdAt: "2026-01-01T00:00:00.000Z",
        });
      }
      return jsonResponse({
        jobId: "video-1", status: "succeeded", errorCode: null, priceCredits: 60,
        imageUrl: null,
        videoUrl: "/v1/creations/video-1/video?exp=1&sig=s",
        videoDownloadUrl: "/v1/creations/video-1/video?download=1&exp=1&sig=s",
        posterUrl: "/v1/creations/video-1/poster?exp=1&sig=p",
        durationSeconds: 5, width: 360, height: 640, mime: "video/mp4",
        mock: true, createdAt: "2026-01-01T00:00:00.000Z",
      });
    }));

    const outcome = await createVideoJobExecutor({ pollIntervalMs: 1, timeoutMs: 500 })(
      request,
      { signal: new AbortController().signal }
    );
    expect(outcome).toMatchObject({
      ok: true,
      videoUrl: "https://api.test/v1/creations/video-1/video?exp=1&sig=s",
      downloadUrl: "https://api.test/v1/creations/video-1/video?download=1&exp=1&sig=s",
      posterUrl: "https://api.test/v1/creations/video-1/poster?exp=1&sig=p",
      durationSeconds: 5,
      width: 360,
      height: 640,
      mock: true,
    });
  });

  it("returns the job's stable worker error code", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.test");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/generations/jobs")) {
        return jsonResponse({ jobId: "video-2", status: "queued", priceCredits: 40 }, 202);
      }
      return jsonResponse({
        jobId: "video-2", status: "failed", errorCode: "UPSTREAM_TIMEOUT",
        priceCredits: 40, imageUrl: null, mock: false, createdAt: "2026-01-01T00:00:00.000Z",
      });
    }));
    const outcome = await createVideoJobExecutor({ pollIntervalMs: 1, timeoutMs: 500 })(
      request,
      { signal: new AbortController().signal }
    );
    expect(outcome).toMatchObject({ ok: false, reason: "http", code: "UPSTREAM_TIMEOUT" });
  });

  it("reports unavailable before any request when no API base is configured", async () => {
    const transport = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", transport);
    const outcome = await createVideoJobExecutor({ pollIntervalMs: 1 })(
      request,
      { signal: new AbortController().signal }
    );
    expect(outcome).toMatchObject({ ok: false, reason: "unavailable" });
    expect(transport).not.toHaveBeenCalled();
  });
});
