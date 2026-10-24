/**
 * GEN suite — T04-S2 port of the legacy T03-B1 matrix GEN-01..GEN-28 for the
 * Fastify generation API (POST /v1/generations).
 *
 * Execution model (unchanged from the legacy suite):
 * - Every request is driven in-process via app.inject(); nothing listens on
 *   3000. The ONLY exception is GEN-10/11, which opens an in-process server
 *   on an EPHEMERAL port (never 3000) to reproduce a real client disconnect.
 * - The upstream is ALWAYS an injected provider (in-process mock, or the
 *   real provider wired to an injected in-process fetch) — no test can
 *   reach the network. The deny-all globalThis.fetch guard from setup.ts
 *   fails the run if any code path escapes the injection boundary.
 * - FAL_KEY is always the fabricated dummy; env is injected per app.
 * - Error responses use the unified ApiErrorEnvelope ({error:{code,message}})
 *   — the legacy flat {error} string now lives at .error.message. All
 *   human-readable copies are asserted verbatim.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { connect as netConnect } from "node:net";
import type { GenerationResponse } from "@wallhaze/contracts";
import {
  createFalProvider,
  createMockProvider,
  UpstreamError,
  type FalProvider,
  type MockOutcome,
} from "../src/modules/generation/fal.provider.js";
import { resetRateLimitStateForTests, tryAcquireConcurrencySlot } from "../src/security/rate-limit.js";
import {
  buildTestApp,
  DUMMY_KEY,
  FAL_EDIT_ENDPOINT,
  FAL_ENDPOINT,
  legalBody,
  networkGuard,
  PNG_DATA_URI,
  PNG_HEADER,
  postGeneration,
  PROMPT_MARKER,
  TEST_ORIGIN,
} from "./helpers.js";

beforeEach(() => {
  // rate-limit state is process-global — every case starts pristine.
  resetRateLimitStateForTests();
});

const SUCCESS_RESPONSE: GenerationResponse = {
  imageUrl: "https://img-cdn.test/result-1.png",
  width: 1080,
  height: 1920,
  contentType: "image/png",
};

function happyProvider(): FalProvider {
  return createMockProvider(() => ({ kind: "success", ...SUCCESS_RESPONSE }));
}

describe("GEN 1x — success path and upstream payload shape", () => {
  it("GEN-01: legal request returns 200 with imageUrl/width/height/contentType and the upstream payload uses the official schema", async () => {
    const provider = happyProvider();
    const { app } = await buildTestApp({ provider });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(SUCCESS_RESPONSE);

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].endpoint).toBe(FAL_ENDPOINT); // text-to-image
    const sent = provider.calls[0].payload;
    expect(sent.num_images).toBe(1);
    expect(sent.enable_safety_checker).toBe(true);
    expect(sent.output_format).toBe("png");
    expect(typeof sent.image_size).toBe("string"); // official enum size
    expect(String(sent.prompt)).toContain(PROMPT_MARKER);
    await app.close();
  });

  it("GEN-01b: a valid size preset is re-resolved server-side into the official custom {width,height} object", async () => {
    const provider = happyProvider();
    const { app } = await buildTestApp({ provider });
    const res = await postGeneration(app, {
      ...legalBody(),
      sizePresetId: "phone-1080x1920",
    });
    expect(res.statusCode).toBe(200);
    expect(provider.calls[0].payload.image_size).toEqual({
      width: 1080,
      height: 1920,
    });
    await app.close();
  });

  it("GEN-02: missing optional upstream fields degrade to null instead of failing", async () => {
    const provider = createMockProvider(() => ({
      kind: "success",
      imageUrl: "https://img-cdn.test/x.png",
    }));
    const { app } = await buildTestApp({ provider });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      imageUrl: "https://img-cdn.test/x.png",
      width: null,
      height: null,
      contentType: null,
    });
    await app.close();
  });

  it("GEN-03: has_nsfw_concepts[0]===true → 422 CONTENT_FILTERED with the safety-checker copy", async () => {
    const { app } = await buildTestApp({
      provider: createMockProvider(() => ({ kind: "nsfw" })),
    });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({
      error: {
        code: "CONTENT_FILTERED",
        message:
          "Your prompt was flagged by the safety checker. Please adjust it and try again.",
      },
    });
    await app.close();
  });

  it("GEN-04: empty images array → 502 with the no-image copy", async () => {
    const { app } = await buildTestApp({
      provider: createMockProvider(() => ({ kind: "no-image" })),
    });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe(
      "The image service returned no image. Please try again."
    );
    await app.close();
  });
});

describe("GEN 2x — upstream failures and error mapping", () => {
  it("GEN-05: upstream 500 with detail → 502 'Image generation failed.'; the provider detail never reaches the response body", async () => {
    const { app } = await buildTestApp({
      provider: createMockProvider(() => ({
        kind: "upstream-status",
        status: 500,
        detail: "upstream boom",
      })),
    });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe(
      "Image generation failed. Please try again."
    );
    expect(res.body).not.toContain("upstream boom");
    await app.close();
  });

  it("GEN-06: upstream 429 → 502 with the busy copy (distinct from the local concurrency 429)", async () => {
    const { app } = await buildTestApp({
      provider: createMockProvider(() => ({
        kind: "upstream-status",
        status: 429,
      })),
    });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(502);
    // Legacy parity: the upstream-busy copy deliberately has NO trailing
    // period (distinct from the local concurrency copy, which has one).
    expect(res.json().error.message).toBe(
      "The image service is busy right now. Please try again in a moment"
    );
    await app.close();
  });

  it("GEN-07: upstream 2xx with a non-JSON body → 502 invalid-response", async () => {
    const { app } = await buildTestApp({
      provider: createMockProvider(() => ({ kind: "invalid-json" })),
    });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe(
      "The image service returned an invalid response. Please try again."
    );
    await app.close();
  });

  it("GEN-08: upstream fetch rejects with a generic error → 502 and log outcome upstream:failed", async () => {
    const { app, capture } = await buildTestApp({
      provider: createMockProvider(() => ({ kind: "network-error" })),
    });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe(
      "Could not reach the image service. Please try again."
    );
    expect(
      capture
        .generateLines()
        .some((l) => l.outcome === "upstream:failed" && l.status === 502)
    ).toBe(true);
    await app.close();
  });

  it("GEN-09: simulated upstream abort (AbortError while the client signal is NOT aborted) → 502 and log outcome upstream:timeout — ERROR MAPPING, not the real 120s timer", async () => {
    const { app, capture } = await buildTestApp({
      provider: createMockProvider(() => ({ kind: "timeout" })),
    });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(502);
    expect(
      capture.generateLines().some((l) => l.outcome === "upstream:timeout")
    ).toBe(true);
    await app.close();
  });

  it("GEN-09b (new-backend unit): the real provider maps raw fetch aborts/errors to typed failures", async () => {
    const abortErr = (): Error =>
      Object.assign(new Error("This operation was aborted"), {
        name: "AbortError",
      });

    // AbortError + client still connected → timeout.
    const timeoutProvider = createFalProvider({
      falKey: DUMMY_KEY,
      fetchImpl: (() => Promise.reject(abortErr())) as unknown as typeof fetch,
    });
    await expect(
      timeoutProvider.generate({
        endpoint: FAL_ENDPOINT,
        payload: {},
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ failure: "timeout" });

    // AbortError + client already gone → client-aborted.
    const clientController = new AbortController();
    clientController.abort();
    const abortedProvider = createFalProvider({
      falKey: DUMMY_KEY,
      fetchImpl: (() => Promise.reject(abortErr())) as unknown as typeof fetch,
    });
    await expect(
      abortedProvider.generate({
        endpoint: FAL_ENDPOINT,
        payload: {},
        signal: clientController.signal,
      })
    ).rejects.toMatchObject({ failure: "client-aborted" });

    // Generic rejection → failed, with the message as LOG-ONLY detail.
    const failedProvider = createFalProvider({
      falKey: DUMMY_KEY,
      fetchImpl: (() =>
        Promise.reject(new Error("ECONNREFUSED by test"))) as unknown as typeof fetch,
    });
    await expect(
      failedProvider.generate({
        endpoint: FAL_ENDPOINT,
        payload: {},
        signal: new AbortController().signal,
      })
    ).rejects.toSatisfy((error: unknown) => {
      const upstream = error as UpstreamError;
      return (
        upstream instanceof UpstreamError &&
        upstream.failure === "failed" &&
        upstream.detail === "ECONNREFUSED by test"
      );
    });

    // Non-2xx → status failure carrying the upstream status.
    const statusProvider = createFalProvider({
      falKey: DUMMY_KEY,
      fetchImpl: (() =>
        Promise.resolve(
          new Response(JSON.stringify({ detail: [{ msg: "boom" }] }), {
            status: 503,
          })
        )) as unknown as typeof fetch,
    });
    await expect(
      statusProvider.generate({
        endpoint: FAL_ENDPOINT,
        payload: {},
        signal: new AbortController().signal,
      })
    ).rejects.toSatisfy((error: unknown) => {
      const upstream = error as UpstreamError;
      return (
        upstream instanceof UpstreamError &&
        upstream.failure === "status" &&
        upstream.upstreamStatus === 503 &&
        upstream.detail === "boom"
      );
    });

    // The Authorization header carries the key ONLY to the upstream call —
    // never into any error or response.
    let seenAuth: string | null = null;
    const falOk = new Response(
      JSON.stringify({
        images: [
          {
            url: "https://img-cdn.test/ok.png",
            content_type: "image/png",
            width: 10,
            height: 10,
          },
        ],
        has_nsfw_concepts: [false],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    const authProvider = createFalProvider({
      falKey: DUMMY_KEY,
      fetchImpl: ((_url: unknown, init?: { headers?: Record<string, string> }) => {
        seenAuth = init?.headers?.Authorization ?? null;
        return Promise.resolve(falOk.clone());
      }) as unknown as typeof fetch,
    });
    const result = await authProvider.generate({
      endpoint: FAL_ENDPOINT,
      payload: { prompt: "p" },
      signal: new AbortController().signal,
    });
    expect(seenAuth).toBe(`Key ${DUMMY_KEY}`);
    expect(result).toEqual({
      imageUrl: "https://img-cdn.test/ok.png",
      width: 10,
      height: 10,
      contentType: "image/png",
    });

    // 2xx JSON without a usable image → no-image.
    const emptyProvider = createFalProvider({
      falKey: DUMMY_KEY,
      fetchImpl: (() =>
        Promise.resolve(new Response("{}", { status: 200 }))) as unknown as typeof fetch,
    });
    await expect(
      emptyProvider.generate({
        endpoint: FAL_ENDPOINT,
        payload: {},
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ failure: "no-image" });
  });

  it("GEN-10+11 (merged, framework re-validation): a REAL client disconnect mid-upstream aborts the merged signal → log upstream:client-aborted and the concurrency slot is released — ephemeral in-process port, never 3000", async () => {
    let capturedSignal: AbortSignal | null = null;
    const getCapturedSignal = (): AbortSignal | null => capturedSignal;
    let notifyReached!: () => void;
    const reached = new Promise<void>((resolve) => {
      notifyReached = resolve;
    });
    // Behaves like the real fetch: rejects with AbortError when its signal
    // aborts (the provider maps that to client-aborted/timeout).
    const hangFetch = ((_input: unknown, init?: { signal?: AbortSignal }) => {
      capturedSignal = init?.signal ?? null;
      notifyReached();
      return new Promise<Response>((_resolve, reject) => {
        (init?.signal as AbortSignal).addEventListener(
          "abort",
          () => {
            reject(
              Object.assign(new Error("This operation was aborted"), {
                name: "AbortError",
              })
            );
          },
          { once: true }
        );
      });
    }) as unknown as typeof fetch;

    const provider = createFalProvider({
      fetchImpl: hangFetch,
      falKey: DUMMY_KEY,
    });
    const { app, capture } = await buildTestApp({
      env: { FAL_KEY: DUMMY_KEY },
      provider,
    });
    // Ephermal in-process listener — the client socket is owned by this
    // test, which is the ONLY way to reproduce a true disconnect (inject
    // never disconnects).
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    expect(port).toBeGreaterThan(0);

    const payload = JSON.stringify(legalBody());
    // Raw HTTP over a hand-owned socket. node:http request.destroy() is NOT
    // reliable here: after a fully-written request it performs a graceful
    // half-close that Node servers can absorb without ever surfacing an
    // abort. net.Socket.resetAndDestroy() sends a real RST, which the
    // server-side reply.raw 'close' hook (writableEnded===false) detects.
    const raw =
      "POST /v1/generations HTTP/1.1\r\n" +
      `Host: 127.0.0.1:${port}\r\n` +
      "content-type: application/json\r\n" +
      `origin: ${TEST_ORIGIN}\r\n` +
      `content-length: ${Buffer.byteLength(payload)}\r\n` +
      "connection: keep-alive\r\n\r\n" +
      payload;
    const socket = netConnect(port, "127.0.0.1");
    // ECONNRESET from our own RST is expected and intentional.
    socket.on("error", () => {});
    socket.on("connect", () => socket.write(raw));

    // Deterministic sync: wait until the provider (and thus the merged
    // signal) is live BEFORE resetting the socket.
    await reached;
    socket.resetAndDestroy();

    await vi.waitFor(
      () => {
        expect(
          capture
            .generateLines()
            .some(
              (l) =>
                l.outcome === "upstream:client-aborted" && l.status === 502
            )
        ).toBe(true);
      },
      { timeout: 5_000, interval: 50 }
    );

    // GEN-11: the route merges the client signal — the provider observed an
    // AbortSignal that is now aborted.
    expect(getCapturedSignal()).toBeInstanceOf(AbortSignal);
    expect(getCapturedSignal()?.aborted).toBe(true);

    // The finally-block released the slot: all three slots acquire freely.
    expect(tryAcquireConcurrencySlot()).toBe(true);
    expect(tryAcquireConcurrencySlot()).toBe(true);
    expect(tryAcquireConcurrencySlot()).toBe(true);

    await app.close();
  });
});

describe("GEN 3x — guard integration (status + copy + log outcome)", () => {
  it("GEN-12: cross-site request → 403 origin copy and log rejected:cross-site-fetch-metadata", async () => {
    const { app, capture } = await buildTestApp({ provider: happyProvider() });
    const res = await postGeneration(app, legalBody(), {
      secFetchSite: "cross-site",
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toBe("Request origin is not allowed");
    expect(
      capture
        .generateLines()
        .some(
          (l) =>
            l.outcome === "rejected:cross-site-fetch-metadata" &&
            l.status === 403
        )
    ).toBe(true);
    await app.close();
  });

  it("GEN-13: text/plain body → 415 with the content-type copy", async () => {
    const { app } = await buildTestApp({ provider: happyProvider() });
    const res = await postGeneration(app, legalBody(), {
      contentType: "text/plain",
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.message).toBe(
      "Unsupported content type — expected application/json."
    );
    await app.close();
  });

  it("GEN-14: Content-Length above 10 MiB → 413 before parsing (pre-check path)", async () => {
    const { app } = await buildTestApp({ provider: happyProvider() });
    const res = await postGeneration(app, legalBody(), {
      contentLength: String(10 * 1024 * 1024 + 1),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.message).toBe(
      "That request is too large — please use a smaller image."
    );
    await app.close();
  });

  it("GEN-16: invalid JSON → 400 and log rejected:body-invalid", async () => {
    const { app, capture } = await buildTestApp({ provider: happyProvider() });
    const res = await postGeneration(app, undefined, {
      rawPayload: "not-json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("Invalid request body.");
    expect(
      capture.generateLines().some((l) => l.outcome === "rejected:body-invalid")
    ).toBe(true);
    await app.close();
  });

  it("GEN-17: prompt longer than 800 chars → 400 mentioning the limit", async () => {
    const { app } = await buildTestApp({ provider: happyProvider() });
    const res = await postGeneration(app, {
      prompt: "x".repeat(801),
      device: "phone",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("800");
    await app.close();
  });

  it("GEN-18: invalid device / ratio / preset / style each produce their distinct 400 copy", async () => {
    const { app } = await buildTestApp({ provider: happyProvider() });

    // device
    const badDevice = await postGeneration(app, { prompt: "p", device: "fridge" });
    expect(badDevice.statusCode).toBe(400);
    expect(badDevice.json().error.message).toBe(
      "Choose a device: phone, tablet or desktop."
    );

    // unsupported ratio
    const badRatio = await postGeneration(app, {
      prompt: "p",
      device: "phone",
      aspectRatio: "7:3",
    });
    expect(badRatio.statusCode).toBe(400);
    expect(badRatio.json().error.message).toBe(
      "That aspect ratio is not available. Please pick another one."
    );

    // unknown preset id
    const badPreset = await postGeneration(app, {
      prompt: "p",
      device: "phone",
      sizePresetId: "nope",
    });
    expect(badPreset.statusCode).toBe(400);
    expect(badPreset.json().error.message).toBe(
      "That size preset is not available. Please pick another one."
    );

    // real preset id, wrong device (desktop-1920x1080 is desktop-only)
    const presetDevice = await postGeneration(app, {
      prompt: "p",
      device: "phone",
      sizePresetId: "desktop-1920x1080",
    });
    expect(presetDevice.statusCode).toBe(400);
    expect(presetDevice.json().error.message).toBe(
      "That size preset is not available for this device."
    );

    // preset and explicit ratio disagree (phone-1080x1920 is 9:16)
    const ratioPreset = await postGeneration(app, {
      prompt: "p",
      device: "phone",
      sizePresetId: "phone-1080x1920",
      aspectRatio: "1:1",
    });
    expect(ratioPreset.statusCode).toBe(400);
    expect(ratioPreset.json().error.message).toBe(
      "The selected size preset does not match the selected aspect ratio."
    );

    // unknown style id
    const badStyle = await postGeneration(app, {
      prompt: "p",
      device: "phone",
      styleId: "no-such-style",
    });
    expect(badStyle.statusCode).toBe(400);
    expect(badStyle.json().error.message).toBe(
      "That style is not available. Please pick another one."
    );

    await app.close();
  });

  it("GEN-18b: no prompt, no style, no reference → 400 empty-input copy", async () => {
    const { app } = await buildTestApp({ provider: happyProvider() });
    const res = await postGeneration(app, { device: "phone" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("Add a prompt or pick a style first.");
    await app.close();
  });
});

describe("GEN 4x — reference image pipeline", () => {
  it("GEN-19: a valid PNG data URI routes to the EDIT endpoint with image_urls and subject-preservation instructions", async () => {
    const provider = happyProvider();
    const { app } = await buildTestApp({ provider });
    // Reference-only (no prompt, no style) → a neutral scene + subject rules.
    const res = await postGeneration(app, {
      device: "phone",
      refImage: PNG_DATA_URI,
    });
    expect(res.statusCode).toBe(200);
    expect(provider.calls[0].endpoint).toBe(FAL_EDIT_ENDPOINT);
    const sent = provider.calls[0].payload;
    expect(sent.image_urls).toEqual([PNG_DATA_URI]);
    const prompt = String(sent.prompt);
    expect(prompt).toContain("newly imagined wallpaper scene");
    expect(prompt).toContain("reference photo as the main subject");
    expect(prompt).toContain("Preserve its distinctive appearance");
    expect(prompt).toContain("Vertical phone wallpaper composition");
    await app.close();
  });

  it("GEN-19b: unsupported MIME (gif) → 400 format copy", async () => {
    const { app } = await buildTestApp({ provider: happyProvider() });
    const res = await postGeneration(app, {
      device: "phone",
      refImage: "data:image/gif;base64,AAAA",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe(
      "Unsupported image format — use PNG, JPEG or WebP."
    );
    await app.close();
  });

  it("GEN-19c: malformed data URI → 400 could-not-read copy", async () => {
    const { app } = await buildTestApp({ provider: happyProvider() });
    const res = await postGeneration(app, {
      device: "phone",
      refImage: "data:image/png;base64,@@@not-base64@@@",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe(
      "That reference image could not be read. Please re-upload it."
    );
    await app.close();
  });

  it("GEN-19d: base64 payload beyond 5 MiB decoded → 413 size copy", async () => {
    const { app } = await buildTestApp({ provider: happyProvider() });
    const bigBytes = new Uint8Array(5 * 1024 * 1024 + 1024);
    bigBytes.set(PNG_HEADER); // passes magic bytes, fails the 5 MiB cap
    const res = await postGeneration(app, {
      device: "phone",
      refImage: `data:image/png;base64,${Buffer.from(bigBytes).toString("base64")}`,
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.message).toBe(
      "Reference image is too large — please keep it under 5 MB."
    );
    await app.close();
  });

  it("GEN-19e: declared PNG whose bytes are not a PNG → 400 magic-byte copy", async () => {
    const { app } = await buildTestApp({ provider: happyProvider() });
    const fakeBytes = new TextEncoder().encode("definitely not a png image");
    const res = await postGeneration(app, {
      device: "phone",
      refImage: `data:image/png;base64,${Buffer.from(fakeBytes).toString("base64")}`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe(
      "The reference image is invalid or its format does not match the declared type."
    );
    await app.close();
  });
});

describe("GEN 5x — pause switch, key absence, log hygiene", () => {
  it("GEN-20: GENERATION_PAUSED=1 → 503 paused copy and log outcome paused", async () => {
    const { app, capture } = await buildTestApp({
      env: { GENERATION_PAUSED: "1" },
      provider: happyProvider(),
    });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(503);
    expect(res.json().error.message).toBe(
      "Image generation is paused by the server. Please try again later."
    );
    expect(capture.generateLines().some((l) => l.outcome === "paused")).toBe(
      true
    );
    await app.close();
  });

  it("GEN-21: missing FAL_KEY → 503 not-configured copy (branch has no log line — asserted as such)", async () => {
    const { app, capture } = await buildTestApp({});
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(503);
    expect(res.json().error.message).toBe(
      "AI generation is not configured yet. Please try again later."
    );
    expect(capture.generateLines()).toHaveLength(0); // honest branch shape
    await app.close();
  });

  it("GEN-26: structured logs never contain the dummy key, the prompt marker or reference-image data; every generate line parses with reqId/outcome/status/durationMs", async () => {
    let outcome: MockOutcome = { kind: "success", ...SUCCESS_RESPONSE };
    const provider = createMockProvider(() => outcome);
    const { app, capture } = await buildTestApp({
      env: { FAL_KEY: DUMMY_KEY },
      provider,
    });

    // One success, one cross-site rejection, one upstream failure.
    await postGeneration(app, legalBody());
    await postGeneration(app, legalBody(), { secFetchSite: "cross-site" });
    outcome = { kind: "network-error" };
    await postGeneration(app, legalBody());

    const all = capture.text();
    expect(all).not.toContain(DUMMY_KEY);
    expect(all).not.toContain(PROMPT_MARKER);
    expect(all).not.toContain("data:image/png");

    const structured = capture.generateLines();
    expect(structured.length).toBeGreaterThanOrEqual(3);
    for (const line of structured) {
      expect(typeof line.reqId).toBe("string");
      expect(String(line.reqId)).not.toContain(DUMMY_KEY);
      expect(typeof line.outcome).toBe("string");
      expect(typeof line.status).toBe("number");
      expect(typeof line.durationMs).toBe("number");
    }
    await app.close();
  });
});

describe("GEN 6x — limiter integration through the real pipeline", () => {
  it("GEN-22: the 11th request from the same bucket within 60s hits the SHORT-WINDOW branch (429 + Retry-After ≤ 60 + log rejected:short-window); the first 10 succeed", async () => {
    const { app, capture } = await buildTestApp({ provider: happyProvider() });
    for (let i = 1; i <= 10; i += 1) {
      const res = await postGeneration(app, legalBody());
      expect(res.statusCode).toBe(200);
    }
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(429);
    expect(res.json().error.message).toBe(
      "Too many requests — please slow down and try again in a moment."
    );
    const retryAfter = res.headers["retry-after"];
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    expect(Number(retryAfter)).toBeLessThanOrEqual(60);
    expect(
      capture
        .generateLines()
        .some((l) => l.outcome === "rejected:short-window")
    ).toBe(true);
    await app.close();
  });

  it("GEN-23: the 31st submission of one client hits the DAILY-QUOTA branch (429 + Retry-After = seconds to UTC midnight + log rejected:daily-quota), using a controlled clock to cross each 60s short window without crossing the UTC day", async () => {
    const { app, capture } = await buildTestApp({
      env: { TRUST_PROXY: "1" },
      provider: happyProvider(),
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.UTC(2026, 0, 1, 10, 0, 0)); // 14h before midnight

      for (let round = 0; round < 3; round += 1) {
        for (let i = 0; i < 10; i += 1) {
          const res = await postGeneration(app, legalBody(), {
            realIp: "10.9.9.9",
          });
          expect(res.statusCode).toBe(200);
        }
        // Cross the 60s short window; still 2026-01-01 UTC → quota not reset.
        vi.advanceTimersByTime(61_000);
      }

      const res = await postGeneration(app, legalBody(), {
        realIp: "10.9.9.9",
      });
      expect(res.statusCode).toBe(429);
      expect(res.json().error.message).toBe(
        "You've reached today's generation limit. Please try again tomorrow."
      );
      // Retry-After must reflect the CURRENT fake clock: 10:00:00Z (14h to
      // UTC midnight) + 3×61s advanced → 50217s. Computed from the live
      // fake clock instead of a hardcoded constant.
      const nowMs = Date.now();
      const nextUtcMidnight = Date.UTC(2026, 0, 2, 0, 0, 0);
      const expectedRetryAfter = String(
        Math.ceil((nextUtcMidnight - nowMs) / 1000)
      );
      expect(res.headers["retry-after"]).toBe(expectedRetryAfter);
      expect(expectedRetryAfter).toBe("50217"); // sanity: 14h − 3×61s
      expect(
        capture
          .generateLines()
          .some((l) => l.outcome === "rejected:daily-quota")
      ).toBe(true);
    } finally {
      vi.useRealTimers();
      await app.close();
    }
  });

  it("GEN-24: the 201st GLOBAL submission hits the GLOBAL-BUDGET branch (503 + copy + Retry-After + log rejected:daily-budget) — 201 distinct trusted-proxy IPs keep per-bucket limits untouched; NO time travel", async () => {
    const { app, capture } = await buildTestApp({
      env: { TRUST_PROXY: "1" },
      provider: happyProvider(),
    });
    for (let i = 1; i <= 200; i += 1) {
      const res = await postGeneration(app, legalBody(), {
        realIp: `10.0.${Math.floor(i / 250)}.${i % 250 || 1}`,
      });
      expect(res.statusCode).toBe(200);
    }
    const res = await postGeneration(app, legalBody(), {
      realIp: "10.0.200.201",
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.message).toBe(
      "The image service has reached today's request limit. Please try again tomorrow."
    );
    const retryAfter = res.headers["retry-after"];
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    expect(
      capture
        .generateLines()
        .some((l) => l.outcome === "rejected:daily-budget" && l.status === 503)
    ).toBe(true);
    await app.close();
  });

  it("GEN-25: the 4th concurrent submission hits the CONCURRENCY branch (429 busy copy, NO Retry-After, log rejected:concurrency); releasing a slot lets the next request succeed", async () => {
    const resolvers: Array<(value: GenerationResponse) => void> = [];
    let reachedCount = 0;
    let mode: "hang" | "instant" = "hang";
    const hangingProvider: FalProvider = {
      calls: [],
      generate() {
        if (mode === "instant") {
          return Promise.resolve(SUCCESS_RESPONSE);
        }
        reachedCount += 1;
        if (reachedCount === 3) {
          // Deterministic sync: all three slots are held from this point on,
          // so the 4th request's 429 can never race ahead of them.
          setImmediate(() => concurrencyReached());
        }
        return new Promise<GenerationResponse>((resolve) => {
          resolvers.push(resolve);
        });
      },
    };
    let notifyConcurrencyReached!: () => void;
    const concurrencyReached = (): void => notifyConcurrencyReached();
    const concurrencyHeld = new Promise<void>((resolve) => {
      notifyConcurrencyReached = resolve;
    });

    const { app: hangingApp, capture } = await buildTestApp({
      provider: hangingProvider,
    });

    const pending = [
      postGeneration(hangingApp, legalBody()),
      postGeneration(hangingApp, legalBody()),
      postGeneration(hangingApp, legalBody()),
    ];
    await concurrencyHeld;

    const fourth = await postGeneration(hangingApp, legalBody());
    expect(fourth.statusCode).toBe(429);
    expect(fourth.json().error.message).toBe(
      "The image service is busy right now. Please try again in a moment."
    );
    expect(fourth.headers["retry-after"]).toBeUndefined();
    expect(
      capture
        .generateLines()
        .some((l) => l.outcome === "rejected:concurrency")
    ).toBe(true);

    // Finish the three in-flight upstream calls → slots released via finally.
    for (const resolve of resolvers) resolve(SUCCESS_RESPONSE);
    const settled = await Promise.all(pending);
    for (const res of settled) expect(res.statusCode).toBe(200);

    // A released slot admits a new request — swap to the instant responder.
    mode = "instant";
    const fifth = await postGeneration(hangingApp, legalBody());
    expect(fifth.statusCode).toBe(200);
    await hangingApp.close();
  });
});

describe("GEN 7x — network guard self-verification", () => {
  it("GEN-28: with NO injected fetch, an outbound attempt is blocked by the deny-all guard, recorded as unexpected, and the route maps it to 502 — proving the guard actually intercepts", async () => {
    // Real provider (explicit live opt-in + FAL_KEY) but NO upstreamFetch →
    // the provider falls back to globalThis.fetch, which setup.ts replaced
    // with the deny-all recorder. The route must translate the guard
    // rejection into 502.
    const { app } = await buildTestApp({
      env: { FAL_KEY: DUMMY_KEY, FAL_LIVE_ENABLED: "1" },
    });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe(
      "Could not reach the image service. Please try again."
    );
    expect(networkGuard.unexpectedCalls).toContain(FAL_ENDPOINT);
    expect(networkGuard.active).toBe(true);
    // Consume the intentional hit so the global afterEach gate stays clean.
    networkGuard.clear();
    await app.close();
  });
});

describe("GEN-27 (SKIPPED by default) — real 120-second AbortSignal.timeout", { skip: !process.env.RUN_S2_REAL_120S }, () => {
  // To actually run this case (~125s, still zero cost because the upstream
  // is a hanging in-process fetch): set RUN_S2_REAL_120S=1 and raise the
  // timeout, e.g.
  //   RUN_S2_REAL_120S=1 npx vitest run -t "GEN-27" --testTimeout 200000
  it("GEN-27: a hanging upstream is aborted by the merged timeout signal after ~120s → 502 + log outcome upstream:timeout", { timeout: 200_000 }, async () => {
    const hangFetch = ((_input: unknown, init?: { signal?: AbortSignal }) => {
      return new Promise<Response>((_resolve, reject) => {
        (init?.signal as AbortSignal).addEventListener(
          "abort",
          () => {
            reject(
              Object.assign(new Error("This operation was aborted"), {
                name: "AbortError",
              })
            );
          },
          { once: true }
        );
      });
    }) as unknown as typeof fetch;
    const provider = createFalProvider({
      fetchImpl: hangFetch,
      falKey: DUMMY_KEY,
    });
    const { app, capture } = await buildTestApp({
      env: { FAL_KEY: DUMMY_KEY },
      provider,
    });
    const startedAt = Date.now();
    const res = await postGeneration(app, legalBody());
    const elapsed = Date.now() - startedAt;
    expect(res.statusCode).toBe(502);
    expect(elapsed).toBeGreaterThanOrEqual(119_000);
    expect(elapsed).toBeLessThan(150_000);
    expect(
      capture.generateLines().some((l) => l.outcome === "upstream:timeout")
    ).toBe(true);
    await app.close();
  });
});

describe('sync image route media-type guard', () => {
  it('rejects video payloads on the synchronous image route', async () => {
    const { app } = await buildTestApp({ provider: createMockProvider() });
    const response = await postGeneration(app, {
      mediaType: 'video',
      prompt: 'a dreamy star field',
      device: 'phone',
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('async job endpoint');
    await app.close();
  });
});
