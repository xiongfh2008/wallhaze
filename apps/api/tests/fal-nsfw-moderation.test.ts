/**
 * fal NSFW output-screening tests (OpenAI-independent moderation).
 *
 * The default backend reuses FAL_KEY against fal-ai/imageutils/nsfw
 * (official schema: in {image_url}, out {nsfw_probability}); every network
 * touch is an injected fetcher, so no paid call can happen.
 *
 * Covered here:
 *  - unit: allow / block / threshold boundary / malformed body / HTTP error /
 *    missing key (enabled=false → unavailable, callers fail closed);
 *  - video: any blocked frame blocks, extraction failure fails closed,
 *    all-allow passes (first→last frame sampling semantics unchanged);
 *  - env factory precedence: OpenAI key wins (legacy), FAL_KEY → fal,
 *    neither → undefined (fail-closed);
 *  - worker integration across ALL FOUR generation modes (text-to-image,
 *    image EDIT incl. reference-image entry screening, text-to-video,
 *    image-to-video): allow → stored + credits captured; blocked output →
 *    never stored, credits released, real cost retained; unavailable →
 *    rejected; flagged reference upload → 422; screening down → 503.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { buildApp } from "../src/app.js";
import { createMemoryDatabase, type Database } from "../src/db/database.js";
import { migrate } from "../src/db/migrate.js";
import { runWorkerOnce } from "../src/business/worker.js";
import { MockJobProvider } from "../src/business/providers.js";
import { createMockVideoProviders } from "../src/modules/generation/video.providers.js";
import { MemoryStorage } from "../src/business/storage.js";
import { PromptModerationService } from "../src/business/moderation.js";
import {
  FalNsfwModerationService,
  resolveOutputModerationFromEnv,
} from "../src/business/fal-nsfw-moderation.js";
import {
  OutputModerationService,
  type OutputScreeningService,
} from "../src/business/output-moderation.js";
import { PNG_HEADER, PNG_DATA_URI } from "./helpers.js";
import type { FastifyInstance } from "fastify";

const PNG_BYTES = Buffer.from(PNG_HEADER);
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

/** fal nsfw fetcher returning the given probability for every call. */
const falWith = (probability: number, status = 200) =>
  new FalNsfwModerationService({
    falKey: "test-fal-key",
    frameExtractor: async () => [PNG_BYTES, PNG_BYTES, PNG_BYTES],
    fetcher: async () =>
      new Response(JSON.stringify({ nsfw_probability: probability }), { status }),
  });

const falFailing = (status = 500) =>
  new FalNsfwModerationService({
    falKey: "test-fal-key",
    frameExtractor: async () => [PNG_BYTES],
    fetcher: async () => new Response("boom", { status }),
  });

const passModeration = () =>
  new PromptModerationService({
    merchantId: "MER_test",
    privateKey: PRIVATE_KEY_PEM,
    fetcher: async () =>
      new Response(JSON.stringify({ data: { action: "allow", requestId: "REQ_OK" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });

describe("FalNsfwModerationService (unit)", () => {
  it("allows below the threshold and blocks at/above it", async () => {
    expect(await falWith(0.01).screenImage({ bytes: PNG_BYTES, mime: "image/png" }))
      .toMatchObject({ action: "allow" });
    expect(await falWith(0.9).screenImage({ bytes: PNG_BYTES, mime: "image/png" }))
      .toMatchObject({ action: "block", categories: ["nsfw"] });
    // Boundary: exactly at the default 0.5 threshold blocks (conservative).
    expect(await falWith(0.5).screenImage({ bytes: PNG_BYTES, mime: "image/png" }))
      .toMatchObject({ action: "block" });
  });

  it("honors a custom threshold", async () => {
    const strict = new FalNsfwModerationService({
      falKey: "k",
      threshold: 0.2,
      fetcher: async () => new Response(JSON.stringify({ nsfw_probability: 0.3 }), { status: 200 }),
    });
    expect(await strict.screenImage({ bytes: PNG_BYTES, mime: "image/png" }))
      .toMatchObject({ action: "block" });
  });

  it("fails closed on malformed bodies, non-2xx and transport errors", async () => {
    const malformed = new FalNsfwModerationService({
      falKey: "k",
      fetcher: async () => new Response('{"oops":true}', { status: 200 }),
    });
    expect(await malformed.screenImage({ bytes: PNG_BYTES, mime: "image/png" }))
      .toMatchObject({ action: "unavailable" });

    expect(await falFailing(500).screenImage({ bytes: PNG_BYTES, mime: "image/png" }))
      .toMatchObject({ action: "unavailable", status: 500 });

    const networkError = new FalNsfwModerationService({
      falKey: "k",
      fetcher: async () => {
        throw new Error("ECONNRESET");
      },
    });
    expect(await networkError.screenImage({ bytes: PNG_BYTES, mime: "image/png" }))
      .toMatchObject({ action: "unavailable", status: null });
  });

  it("is disabled without a FAL key and never passes unscreened output", async () => {
    const service = new FalNsfwModerationService({ falKey: null });
    expect(service.enabled).toBe(false);
    expect(await service.screenImage({ bytes: PNG_BYTES, mime: "image/png" }))
      .toMatchObject({ action: "unavailable" });
    expect(
      await service.screenVideo({ bytes: PNG_BYTES, mime: "video/mp4", durationSeconds: 5 })
    ).toMatchObject({ action: "unavailable" });
  });

  it("passes compact JPEG/PNG/WebP through WITHOUT conversion", async () => {
    let seenBody = "";
    let converterRan = false;
    const jpeg = Buffer.alloc(1024, 0x7f); // 1 KB compact JPEG stub
    const service = new FalNsfwModerationService({
      falKey: "k",
      reviewImageConverter: async () => {
        converterRan = true;
        return { bytes: Buffer.from("converted"), mime: "image/jpeg" };
      },
      fetcher: async (_url, init) => {
        seenBody = String(init?.body);
        return new Response(JSON.stringify({ nsfw_probability: 0.01 }), { status: 200 });
      },
    });
    expect(await service.screenImage({ bytes: jpeg, mime: "image/jpeg" })).toMatchObject({ action: "allow" });
    expect(converterRan).toBe(false);
    expect(seenBody).toContain("data:image/jpeg;base64,");
  });

  it("converts large generated PNGs to a compact JPEG review copy and keeps the original untouched", async () => {
    const bigPng = Buffer.concat([PNG_HEADER, Buffer.alloc(700 * 1024, 0x11)]); // > passthrough threshold
    let seenBody = "";
    let convertedInput: { size: number; mime: string } | null = null;
    const service = new FalNsfwModerationService({
      falKey: "k",
      reviewImageConverter: async (bytes, mime, maxEdge) => {
        convertedInput = { size: bytes.length, mime };
        expect(maxEdge).toBe(1280);
        return { bytes: Buffer.alloc(64 * 1024, 0x22), mime: "image/jpeg" };
      },
      fetcher: async (_url, init) => {
        seenBody = String(init?.body);
        return new Response(JSON.stringify({ nsfw_probability: 0.01 }), { status: 200 });
      },
      log: (e) => (logEvents.push(e), undefined),
    });
    const logEvents: import("../src/business/fal-nsfw-moderation.js").FalNsfwLogEvent[] = [];
    expect(await service.screenImage({ bytes: bigPng, mime: "image/png", jobId: "job-1" }))
      .toMatchObject({ action: "allow" });
    // The review copy — NOT the original — was transmitted.
    expect(convertedInput).toMatchObject({ size: bigPng.length, mime: "image/png" });
    expect(seenBody).toContain("data:image/jpeg;base64,");
    expect(seenBody.length).toBeLessThan(200 * 1024); // compact request
    // Sanitized diagnostics: sizes/status/latency present, secrets absent.
    const log = logEvents[0];
    expect(log).toMatchObject({
      event: "output_moderation.request",
      backend: "fal_nsfw",
      jobId: "job-1",
      bytes: bigPng.length,
      reviewBytes: 64 * 1024,
      reviewMime: "image/jpeg",
      converted: true,
      httpStatus: 200,
      errorCategory: "none",
    });
    const serialized = JSON.stringify(log);
    expect(serialized).not.toContain("base64");
    expect(serialized).not.toContain("falKey");
  });

  it("fails closed WITHOUT a doomed request when a large image cannot be converted", async () => {
    let fetchCalls = 0;
    const service = new FalNsfwModerationService({
      falKey: "k",
      reviewImageConverter: async () => {
        throw new Error("ffmpeg exploded");
      },
      fetcher: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ nsfw_probability: 0.01 }), { status: 200 });
      },
      log: (e) => (logEvents.push(e), undefined),
    });
    const logEvents: import("../src/business/fal-nsfw-moderation.js").FalNsfwLogEvent[] = [];
    const big = Buffer.concat([PNG_HEADER, Buffer.alloc(700 * 1024)]);
    expect(await service.screenImage({ bytes: big, mime: "image/png" }))
      .toMatchObject({ action: "unavailable" });
    expect(fetchCalls).toBe(0); // no doomed network call
    expect(logEvents[0]).toMatchObject({ errorCategory: "conversion_failed" });
  });

  it("normalizes unsupported MIME types through the converter", async () => {
    const tiff = Buffer.alloc(1024); // compact but NOT in the compact-mime set
    let seenBody = "";
    const service = new FalNsfwModerationService({
      falKey: "k",
      reviewImageConverter: async (bytes, mime) => {
        expect(mime).toBe("image/tiff");
        expect(bytes.length).toBe(tiff.length);
        return { bytes: Buffer.alloc(32 * 1024), mime: "image/jpeg" };
      },
      fetcher: async (_url, init) => {
        seenBody = String(init?.body);
        return new Response(JSON.stringify({ nsfw_probability: 0.02 }), { status: 200 });
      },
    });
    expect(await service.screenImage({ bytes: tiff, mime: "image/tiff" })).toMatchObject({ action: "allow" });
    expect(seenBody).toContain("data:image/jpeg;base64,");
  });

  it("maps documented fal HTTP failures (413/422/429/503) to fail-closed with the status logged", async () => {
    for (const status of [413, 422, 429, 503]) {
      const logEvents: import("../src/business/fal-nsfw-moderation.js").FalNsfwLogEvent[] = [];
      const service = new FalNsfwModerationService({
        falKey: "k",
        fetcher: async () => new Response("too large / rejected", { status }),
        log: (e) => (logEvents.push(e), undefined),
      });
      expect(await service.screenImage({ bytes: PNG_BYTES, mime: "image/png" }))
        .toMatchObject({ action: "unavailable", status });
      expect(logEvents[0]).toMatchObject({ httpStatus: status, errorCategory: "http_error" });
    }
  });

  it("classifies transport timeouts separately from other transport errors", async () => {
    const timeout = new FalNsfwModerationService({
      falKey: "k",
      fetcher: async () => {
        const e = new Error("The operation was aborted due to timeout");
        e.name = "TimeoutError";
        throw e;
      },
      log: (e) => (logEvents.push(e), undefined),
    });
    const logEvents: import("../src/business/fal-nsfw-moderation.js").FalNsfwLogEvent[] = [];
    expect(await timeout.screenImage({ bytes: PNG_BYTES, mime: "image/png" }))
      .toMatchObject({ action: "unavailable" });
    expect(logEvents[0]).toMatchObject({ httpStatus: null, errorCategory: "transport_timeout" });

    const logEvents2: import("../src/business/fal-nsfw-moderation.js").FalNsfwLogEvent[] = [];
    const reset = new FalNsfwModerationService({
      falKey: "k",
      fetcher: async () => {
        throw new Error("ECONNRESET");
      },
      log: (e) => (logEvents2.push(e), undefined),
    });
    expect(await reset.screenImage({ bytes: PNG_BYTES, mime: "image/png" }))
      .toMatchObject({ action: "unavailable" });
    expect(logEvents2[0]).toMatchObject({ errorCategory: "transport_error" });
  });

  it("screens video frame by frame; any blocked frame blocks; extraction failure fails closed", async () => {
    // 1 of 3 frames flagged → whole video blocked.
    let call = 0;
    const mixed = new FalNsfwModerationService({
      falKey: "k",
      frameExtractor: async () => [PNG_BYTES, PNG_BYTES, PNG_BYTES],
      fetcher: async () => {
        call += 1;
        return new Response(
          JSON.stringify({ nsfw_probability: call === 2 ? 0.99 : 0.01 }),
          { status: 200 }
        );
      },
    });
    expect(
      await mixed.screenVideo({ bytes: PNG_BYTES, mime: "video/mp4", durationSeconds: 5 })
    ).toMatchObject({ action: "block", categories: ["nsfw"] });

    // All frames clean → allow.
    expect(await falWith(0.01).screenVideo({ bytes: PNG_BYTES, mime: "video/mp4", durationSeconds: 5 }))
      .toMatchObject({ action: "allow" });

    // Frame extraction fails (no ffmpeg etc.) → fail closed.
    const extractionFailure = new FalNsfwModerationService({
      falKey: "k",
      frameExtractor: async () => {
        throw new Error("ffmpeg missing");
      },
      fetcher: async () => new Response(JSON.stringify({ nsfw_probability: 0.01 }), { status: 200 }),
    });
    expect(
      await extractionFailure.screenVideo({ bytes: PNG_BYTES, mime: "video/mp4", durationSeconds: 5 })
    ).toMatchObject({ action: "unavailable" });

    // Zero frames extracted → fail closed.
    const empty = new FalNsfwModerationService({
      falKey: "k",
      frameExtractor: async () => [],
      fetcher: async () => new Response(JSON.stringify({ nsfw_probability: 0.01 }), { status: 200 }),
    });
    expect(
      await empty.screenVideo({ bytes: PNG_BYTES, mime: "video/mp4", durationSeconds: 5 })
    ).toMatchObject({ action: "unavailable" });

    // One frame unscreenable (HTTP error) among clean ones → fail closed.
    let n = 0;
    const partialFailure = new FalNsfwModerationService({
      falKey: "k",
      frameExtractor: async () => [PNG_BYTES, PNG_BYTES],
      fetcher: async () => {
        n += 1;
        return n === 1
          ? new Response(JSON.stringify({ nsfw_probability: 0.01 }), { status: 200 })
          : new Response("err", { status: 503 });
      },
    });
    expect(
      await partialFailure.screenVideo({ bytes: PNG_BYTES, mime: "video/mp4", durationSeconds: 5 })
    ).toMatchObject({ action: "unavailable", status: 503 });
  });
});

describe("resolveOutputModerationFromEnv (backend precedence)", () => {
  const base = { FAL_MOCK: "1" };

  it("prefers the OpenAI backend when its key is set (legacy path intact)", () => {
    const service = resolveOutputModerationFromEnv({
      ...base,
      OUTPUT_MODERATION_API_KEY: "sk-legacy",
    } as never);
    expect(service).toBeInstanceOf(OutputModerationService);
    expect((service as OutputModerationService).enabled).toBe(true);
  });

  it("selects the fal NSFW backend with FAL_KEY when no OpenAI key exists", () => {
    const service = resolveOutputModerationFromEnv({
      ...base,
      FAL_KEY: "fal-key",
      FAL_NSFW_THRESHOLD: "0.7",
    } as never);
    expect(service).toBeInstanceOf(FalNsfwModerationService);
    expect((service as FalNsfwModerationService).enabled).toBe(true);
    expect((service as FalNsfwModerationService).threshold).toBe(0.7);
  });

  it("returns undefined without any key — live output fails closed", () => {
    expect(resolveOutputModerationFromEnv({ ...base } as never)).toBeUndefined();
  });

  it("falls back to the default threshold on an invalid value", () => {
    const service = resolveOutputModerationFromEnv({
      ...base,
      FAL_KEY: "k",
      FAL_NSFW_THRESHOLD: "not-a-number",
    } as never) as FalNsfwModerationService;
    expect(service.threshold).toBe(0.5);
  });
});

/** Live-mode boot with the fal NSFW backend wired (four-mode integration). */
describe("four-mode live pipeline behind fal NSFW screening", () => {
  let db: Database;
  let app: FastifyInstance;
  let cleanup: (() => Promise<void>) | undefined;
  let auth: Record<string, string>;
  // Delegating holder: tests reassign `current` and BOTH the app (reference
  // screening) and the worker (output screening) see the new backend.
  let current: OutputScreeningService;
  let storage: MemoryStorage;
  const switchable: OutputScreeningService = {
    get enabled() {
      return current.enabled;
    },
    screenImage: (input) => current.screenImage(input),
    screenVideo: (input) => current.screenVideo(input),
  };
  let userId: string;

  beforeEach(async () => {
    db = await createMemoryDatabase();
    await migrate(db);
    storage = new MemoryStorage();
    current = falWith(0.01);
    const built = await buildApp({
      env: {
        CORS_ALLOWED_ORIGINS: "https://web.example",
        PAYMENT_MOCK_SECRET: "s",
        PAYMENT_PROVIDER: "mock",
        PURCHASES_PUBLIC_ENABLED: "1",
        STUDIO_PUBLIC_ENABLED: "1",
        VIDEO_PUBLIC_ENABLED: "1",
        FAL_LIVE_ENABLED: "1",
        FAL_KEY: "test-fal-key",
      },
      database: db,
      storage,
      paymentSecret: "s",
      userDailyCostLimitMicros: 50_000_000,
      videoProviders: createMockVideoProviders(),
      outputModeration: switchable,
    });
    app = built.app;
    cleanup = () => app.close();
    const signup = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      headers: { "x-wallhaze-client": "web", "content-type": "application/json", origin: "https://web.example" },
      payload: { email: "nsfw-e2e@example.test", password: "example-password-long" },
    });
    auth = {
      "x-wallhaze-client": "web",
      "content-type": "application/json",
      origin: "https://web.example",
      cookie: signup.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    };
    userId = (await db.query<{ id: string }>("SELECT id FROM users LIMIT 1")).rows[0].id;
    await db.transaction(async (tx) => {
      const { credit } = await import("../src/business/wallet.js");
      await credit(tx, userId, 200, "seed", "test");
    });
  });

  afterEach(async () => {
    await cleanup?.();
    await db?.close();
  });

  const workerDeps = () => ({
    provider: new MockJobProvider(),
    videoProviders: createMockVideoProviders(),
    // The SAME storage instance the app holds — worker-written assets must
    // be readable by the routes (I2V source fetch, signed delivery).
    storage,
    generationMode: "live" as const,
    mock: false,
    moderation: passModeration(),
    outputModeration: switchable,
  });

  const wallet = async () =>
    (await app.inject({ method: "GET", url: "/v1/credits/wallet", headers: auth })).json();

  async function createImage(key: string, extra: Record<string, unknown> = {}) {
    return app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...auth, "idempotency-key": key },
      payload: { prompt: "a quiet lake", device: "phone", ...extra },
    });
  }

  async function createVideo(key: string, mode: "text_to_video" | "image_to_video", extra: Record<string, unknown> = {}) {
    return app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...auth, "idempotency-key": key },
      payload: {
        mediaType: "video",
        generationMode: mode,
        prompt: "soft drifting clouds",
        styleId: "anime-fantasy",
        device: "phone",
        aspectRatio: "9:16",
        durationSeconds: mode === "image_to_video" ? 5 : 3,
        ...extra,
      },
    });
  }

  async function runToSettled(): Promise<void> {
    await runWorkerOnce(db, workerDeps(), "nsfw-worker");
  }

  it("text-to-image: clean output is stored, credits captured; NSFW output is never stored and credits released", async () => {
    // Clean run → captured.
    const okJob = await createImage("nsfw-t2i-ok");
    expect(okJob.statusCode).toBe(202);
    await runToSettled();
    const ok = (
      await app.inject({ method: "GET", url: `/v1/generations/jobs/${okJob.json().jobId}`, headers: auth })
    ).json();
    expect(ok.status).toBe("succeeded");
    expect(ok.imageUrl).toBeTruthy();
    expect((await wallet()).credits).toBe(190); // 200 - 10 captured

    // NSFW run → job failed, NOTHING stored, credits released (cost retained).
    current = falWith(0.99);
    const badJob = await createImage("nsfw-t2i-bad");
    expect(badJob.statusCode).toBe(202);
    await runToSettled();
    const bad = (
      await app.inject({ method: "GET", url: `/v1/generations/jobs/${badJob.json().jobId}`, headers: auth })
    ).json();
    expect(bad.status).toBe("failed");
    expect(bad.errorCode).toBe("OUTPUT_MODERATION_BLOCKED");
    expect(
      (await db.query("SELECT count(*)::int AS n FROM image_assets WHERE job_id=$1", [badJob.json().jobId])).rows[0].n
    ).toBe(0);
    // Compensation: the hold was released — user pays nothing for a blocked output.
    const w = await wallet();
    expect(w).toMatchObject({ credits: 190, reserved: 0 });
    // Real provider cost is retained on the budget (provider was billed).
    const spent = await db.query<{ spent: string }>(
      "SELECT spent FROM generation_budgets WHERE scope_id=$1",
      [userId]
    );
    expect(Number(spent.rows[0].spent)).toBeGreaterThan(0);
  });

  it("image EDIT: reference upload screened at entry; clean ref + clean output delivers", async () => {
    const okRef = await createImage("nsfw-edit-ok", { refImage: PNG_DATA_URI, prompt: "make it dusk" });
    expect(okRef.statusCode).toBe(202);
    await runToSettled();
    const ok = (
      await app.inject({ method: "GET", url: `/v1/generations/jobs/${okRef.json().jobId}`, headers: auth })
    ).json();
    expect(ok.status).toBe("succeeded");

    // Flagged reference upload is refused BEFORE any job/credit exists.
    current = falWith(0.99);
    const blockedRef = await createImage("nsfw-edit-bad", { refImage: PNG_DATA_URI });
    expect(blockedRef.statusCode).toBe(422);
    expect(blockedRef.json().error.code).toBe("CONTENT_FILTERED");
    expect(
      (await db.query("SELECT count(*)::int AS n FROM generation_jobs")).rows[0].n
    ).toBe(1); // only the earlier clean edit job
    expect((await wallet()).credits).toBe(190);
  });

  it("reference upload fails closed (503) when screening is unavailable", async () => {
    current = new FalNsfwModerationService({ falKey: null });
    const res = await createImage("nsfw-ref-noservice", { refImage: PNG_DATA_URI });
    expect(res.statusCode).toBe(503);
  });

  it("text-to-video: clean frames deliver; one flagged frame blocks the whole video", async () => {
    const okJob = await createVideo("nsfw-t2v-ok", "text_to_video");
    expect(okJob.statusCode).toBe(202);
    expect(okJob.json().priceCredits).toBe(40);
    await runToSettled();
    const ok = (
      await app.inject({ method: "GET", url: `/v1/generations/jobs/${okJob.json().jobId}`, headers: auth })
    ).json();
    expect(ok.status).toBe("succeeded");
    expect(ok.videoUrl).toBeTruthy();
    expect((await wallet()).credits).toBe(160); // 200 - 40

    current = falWith(0.99); // every sampled frame flagged
    const badJob = await createVideo("nsfw-t2v-bad", "text_to_video");
    await runToSettled();
    const bad = (
      await app.inject({ method: "GET", url: `/v1/generations/jobs/${badJob.json().jobId}`, headers: auth })
    ).json();
    expect(bad.status).toBe("failed");
    expect(bad.errorCode).toBe("OUTPUT_MODERATION_BLOCKED");
    expect(
      (await db.query("SELECT count(*)::int AS n FROM image_assets WHERE job_id=$1", [badJob.json().jobId])).rows[0].n
    ).toBe(0);
    expect((await wallet()).credits).toBe(160); // released, never charged
  });

  it("image-to-video: clean output delivers; screening-unavailable never stores", async () => {
    // Use the clean t2i asset from the first test as the I2V source.
    const src = await createImage("nsfw-i2v-src");
    await runToSettled();
    const srcId = src.json().jobId;

    const okJob = await createVideo("nsfw-i2v-ok", "image_to_video", { sourceCreationId: srcId });
    expect(okJob.statusCode).toBe(202);
    await runToSettled();
    const ok = (
      await app.inject({ method: "GET", url: `/v1/generations/jobs/${okJob.json().jobId}`, headers: auth })
    ).json();
    expect(ok.status).toBe("succeeded");

    // Screening down (HTTP errors) at COMPLETION time → fail closed: no
    // storage, credits released. (At CREATION time a down service refuses
    // the job outright at entry — the source image is re-screened there.)
    const badJob = await createVideo("nsfw-i2v-bad", "image_to_video", { sourceCreationId: srcId });
    expect(badJob.statusCode).toBe(202);
    current = falFailing(500);
    await runToSettled();
    const bad = (
      await app.inject({ method: "GET", url: `/v1/generations/jobs/${badJob.json().jobId}`, headers: auth })
    ).json();
    expect(bad.status).toBe("failed");
    expect(bad.errorCode).toBe("OUTPUT_MODERATION_UNAVAILABLE");
    expect(
      (await db.query("SELECT count(*)::int AS n FROM image_assets WHERE job_id=$1", [badJob.json().jobId])).rows[0].n
    ).toBe(0);
  });

  it("large generated PNG: review copy screens, ORIGINAL bytes are stored, credits captured exactly once", async () => {
    const original = Buffer.concat([PNG_HEADER, Buffer.alloc(600 * 1024, 0x5a)]);
    const conversions: number[] = [];
    current = new FalNsfwModerationService({
      falKey: "k",
      reviewImageConverter: async (bytes, mime, maxEdge) => {
        conversions.push(bytes.length);
        expect(mime).toBe("image/png");
        expect(maxEdge).toBe(1280);
        return { bytes: Buffer.alloc(48 * 1024, 0x33), mime: "image/jpeg" };
      },
      fetcher: async () => new Response(JSON.stringify({ nsfw_probability: 0.01 }), { status: 200 }),
    });
    const bigProvider: import("../src/business/providers.js").JobProvider = {
      async generate() {
        return { bytes: original, mime: "image/png" };
      },
    };
    const job = await createImage("nsfw-bigpng");
    expect(job.statusCode).toBe(202);
    await runWorkerOnce(db, { ...workerDeps(), provider: bigProvider }, "nsfw-worker");
    const view = (
      await app.inject({ method: "GET", url: `/v1/generations/jobs/${job.json().jobId}`, headers: auth })
    ).json();
    expect(view.status).toBe("succeeded");
    expect(view.imageUrl).toBeTruthy();
    // The stored/delivered asset is the ORIGINAL full-size PNG, not the review copy.
    const asset = (
      await db.query("SELECT mime,size_bytes FROM image_assets WHERE job_id=$1", [job.json().jobId])
    ).rows[0];
    expect(asset.mime).toBe("image/png");
    expect(Number(asset.size_bytes)).toBe(original.length);
    expect(conversions).toEqual([original.length]); // reviewed via the compact copy
    // Credits captured exactly once.
    const captures = await db.query(
      "SELECT count(*)::int AS n FROM credit_ledger WHERE reason='generation.captured' AND idempotency_key=$1",
      [`capture:${job.json().jobId}`]
    );
    expect(captures.rows[0].n).toBe(1);
    expect((await wallet()).credits).toBe(190);
  });

  it("moderation logs record the fal screening decisions", async () => {
    await createImage("nsfw-log");
    current = falWith(0.99);
    await runToSettled();
    const log = (
      await db.query<{ action: string; service: string; disposition: string }>(
        "SELECT action,service,disposition FROM moderation_logs WHERE stage='post_generation' ORDER BY id DESC LIMIT 1"
      )
    ).rows[0];
    expect(log).toMatchObject({ action: "block", service: "output_moderation", disposition: "rejected_not_published" });
  });
});
