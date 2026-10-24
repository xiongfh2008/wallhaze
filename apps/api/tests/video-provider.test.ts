import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLiveVideoProviders } from "../src/modules/generation/video.providers.js";

const mp4 = readFileSync(path.resolve("assets/live-mock/9x16-5s.mp4"));
const poster = readFileSync(path.resolve("assets/live-mock/9x16-5s.png"));
const sourceDataUri = `data:image/png;base64,${poster.toString("base64")}`;

function makeFetch() {
  const calls: Array<{ url: string; init?: RequestInit; body?: unknown }> = [];
  let statusCalls = 0;
  const fetcher = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/image-to-video") || url.endsWith("/text-to-video")) {
      return new Response(JSON.stringify({ request_id: "req-1", status: "IN_QUEUE" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/requests/req-1/status")) {
      statusCalls += 1;
      const status = statusCalls >= 2 ? "COMPLETED" : "IN_PROGRESS";
      return new Response(JSON.stringify({ request_id: "req-1", status }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/requests/req-1")) {
      return new Response(
        JSON.stringify({
          video: {
            url: "https://v3.fal.media/mock.mp4",
            content_type: "video/mp4",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://v3.fal.media/mock.mp4") {
      return new Response(mp4, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": String(mp4.length) },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("live video provider adapters (injected fetch, no network)", () => {
  it("maps Wan I2V to the official queue schema with duration/ratio and a source poster", async () => {
    const { fetcher, calls } = makeFetch();
    const providers = createLiveVideoProviders({ falKey: "dummy-key", fetcher });
    const output = await providers.imageToVideo.generate(
      {
        generationMode: "image_to_video",
        durationSeconds: 5,
        aspectRatio: "9:16",
        finalPrompt: "anime girl under cherry blossoms, petals drifting slowly",
        motionPrompt: "petals fall slowly",
        negativePrompt: "text, watermark",
        sourceImageDataUri: sourceDataUri,
        width: null,
        height: null,
      },
      new AbortController().signal
    );
    expect(output.video.mime).toBe("video/mp4");
    expect(output.video.bytes.length).toBe(mp4.length);
    expect(output.poster?.mime).toBe("image/png");
    // The fake upstream returns the 9:16 mock fixture, so the probe reports
    // its real 360x640 dimensions rather than the requested 720p class.
    expect(output.width).toBe(360);
    expect(output.height).toBe(640);
    expect(output.durationSeconds).toBe(5);

    const submit = calls[0];
    expect(submit.url).toContain("fal-ai/wan/v2.2-5b/image-to-video");
    expect(submit.init?.headers).toMatchObject({ Authorization: "Key dummy-key" });
    expect(submit.body).toMatchObject({
      image_url: sourceDataUri,
      prompt: "anime girl under cherry blossoms, petals drifting slowly",
      num_frames: 120,
      frames_per_second: 24,
      resolution: "720p",
      aspect_ratio: "9:16",
      enable_safety_checker: true,
      video_quality: "high",
    });
  }, 15_000);

  it("maps Kling T2V to the official queue schema with audio off", async () => {
    const { fetcher, calls } = makeFetch();
    const providers = createLiveVideoProviders({ falKey: "dummy-key", fetcher });
    const output = await providers.textToVideo.generate(
      {
        generationMode: "text_to_video",
        durationSeconds: 3,
        aspectRatio: "16:9",
        finalPrompt: "a slow dreamy nebula with drifting violet clouds",
        motionPrompt: "",
        negativePrompt: "text, watermark",
        sourceImageDataUri: null,
        width: null,
        height: null,
      },
      new AbortController().signal
    );
    expect(output.poster).toBeNull();
    const submit = calls[0];
    expect(submit.url).toContain("kling-video/v3/standard/text-to-video");
    expect(submit.body).toMatchObject({
      prompt: "a slow dreamy nebula with drifting violet clouds",
      duration: "3",
      generate_audio: false,
      aspect_ratio: "16:9",
      negative_prompt: "text, watermark",
      enable_safety_checker: true,
    });
  }, 15_000);
});
