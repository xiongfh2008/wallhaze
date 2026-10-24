import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createMemoryDatabase, type Database } from "../src/db/database.js";
import { runWorkerOnce } from "../src/business/worker.js";
import { MockJobProvider } from "../src/business/providers.js";
import { createMockVideoProviders } from "../src/modules/generation/video.providers.js";
import { MemoryStorage } from "../src/business/storage.js";
import { credit } from "../src/business/wallet.js";
import { claimJob } from "../src/business/jobs.js";

const SECRET = "test-only-payment-signature-secret";
const WEB = {
  "x-wallhaze-client": "web",
  "content-type": "application/json",
  origin: "https://web.example",
};

describe("video generation jobs (mock, no network)", () => {
  let db: Database;
  let cleanup: (() => Promise<void>) | null = null;
  let storage: MemoryStorage;

  beforeEach(async () => {
    db = await createMemoryDatabase();
    storage = new MemoryStorage();
  });
  afterEach(async () => {
    await cleanup?.();
    await db.close();
  });

  async function boot(options: {
    video?: boolean;
    generationMode?: "mock" | "live" | "disabled";
  } = {}) {
    const { app } = await buildApp({
      env: {
        CORS_ALLOWED_ORIGINS: "https://web.example",
        PAYMENT_MOCK_SECRET: SECRET,
      },
      database: db,
      paymentSecret: SECRET,
      storage,
      generationMode: options.generationMode ?? "mock",
      videoProviders: options.video === false ? undefined : createMockVideoProviders(),
      userDailyCostLimitMicros: 20_000_000,
    });
    cleanup = async () => app.close();
    return app;
  }

  async function signUpAndFund(app: Awaited<ReturnType<typeof boot>>, balance = 200) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      headers: WEB,
      payload: { email: `video-${Date.now()}-${Math.random()}@example.test`, password: "example-password-long" },
    });
    expect(res.statusCode).toBe(200);
    const cookies = res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const user = (await db.query<{ id: string }>("SELECT id FROM users ORDER BY created_at DESC LIMIT 1")).rows[0];
    await db.transaction((tx) => credit(tx, user.id, balance, `seed-${user.id}`, "test"));
    return { user, headers: { ...WEB, cookie: cookies } };
  }

  const t2vBody = {
    mediaType: "video",
    generationMode: "text_to_video",
    prompt: "A dreamy star field with slow shimmering light and violet clouds",
    styleId: "anime-fantasy",
    device: "phone",
    aspectRatio: "9:16",
    durationSeconds: 5,
  };

  it("creates a T2V job with a separate price, runs the mock worker, and serves an MP4 with Range + poster", async () => {
    const app = await boot();
    const { headers } = await signUpAndFund(app);

    const pricing = await app.inject({ method: "GET", url: "/v1/credits/pricing" });
    expect(pricing.json()).toMatchObject({
      creditsPerGeneration: 10,
      video: {
        available: true,
        mock: true,
        modes: {
          text_to_video: {
            durations: [3, 4, 5],
            creditsByDuration: { 3: 40, 4: 50, 5: 60 },
            generateAudio: false,
          },
          image_to_video: { durations: [5], creditsByDuration: { 5: 40 } },
        },
      },
    });

    const job = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...headers, "idempotency-key": "video-t2v-1" },
      payload: t2vBody,
    });
    expect(job.statusCode).toBe(202);
    expect(job.json()).toMatchObject({
      status: "queued",
      priceCredits: 60,
      mediaType: "video",
      generationMode: "text_to_video",
      durationSeconds: 5,
    });
    expect((await app.inject({ method: "GET", url: "/v1/credits/wallet", headers })).json()).toMatchObject({
      credits: 200,
      reserved: 60,
    });

    expect(
      await runWorkerOnce(
        db,
        {
          provider: new MockJobProvider(),
          videoProviders: createMockVideoProviders(),
          storage,
          generationMode: "mock",
          mock: true,
        },
        "video-test-worker"
      )
    ).toBe(true);

    const status = await app.inject({
      method: "GET",
      url: `/v1/generations/jobs/${job.json().jobId}`,
      headers,
    });
    expect(status.statusCode).toBe(200);
    const body = status.json();
    expect(body).toMatchObject({
      status: "succeeded",
      mediaType: "video",
      durationSeconds: 5,
      mime: "video/mp4",
      mock: true,
    });
    expect(body.videoUrl).toContain("/video?");
    expect(body.videoDownloadUrl).toContain("download=1");
    expect(body.posterUrl).toContain("/poster?");
    expect(body.imageUrl).toBeNull();
    expect((await app.inject({ method: "GET", url: "/v1/credits/wallet", headers })).json()).toMatchObject({
      credits: 200,
      reserved: 0,
    });

    const creations = await app.inject({ method: "GET", url: "/v1/creations", headers });
    expect(creations.json().items).toHaveLength(1);
    expect(creations.json().items[0]).toMatchObject({
      mediaType: "video",
      imageUrl: null,
      durationSeconds: 5,
    });
    expect(creations.json().items[0].videoUrl).toContain("/video?");

    const video = await app.inject({ method: "GET", url: body.videoUrl });
    expect(video.statusCode).toBe(200);
    expect(video.headers["content-type"]).toBe("video/mp4");
    expect(video.headers["accept-ranges"]).toBe("bytes");
    expect(Number(video.headers["content-length"])).toBeGreaterThan(1000);

    const head = await app.inject({ method: "HEAD", url: body.videoUrl });
    expect(head.statusCode).toBe(200);
    expect(head.headers["content-type"]).toBe("video/mp4");
    expect(head.body).toBe("");

    const ranged = await app.inject({
      method: "GET",
      url: body.videoUrl,
      headers: { range: "bytes=0-99" },
    });
    expect(ranged.statusCode).toBe(206);
    expect(ranged.headers["content-range"]).toMatch(/^bytes 0-99\/\d+$/);
    expect(ranged.rawPayload.length).toBe(100);

    const invalidRange = await app.inject({
      method: "GET",
      url: body.videoUrl,
      headers: { range: "bytes=999999999-" },
    });
    expect(invalidRange.statusCode).toBe(416);
    expect(invalidRange.headers["content-range"]).toContain("bytes */");

    const poster = await app.inject({ method: "GET", url: body.posterUrl });
    expect(poster.statusCode).toBe(200);
    expect(poster.headers["content-type"]).toBe("image/png");

    const download = await app.inject({
      method: "GET",
      url: `/v1/creations/${body.jobId}/download`,
      headers,
    });
    expect(download.json().mediaType).toBe("video");
    const dl = await app.inject({ method: "GET", url: download.json().url });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers["content-disposition"]).toContain(".mp4");
  });

  it("rejects unsupported I2V durations and accepts 3s T2V", async () => {
    const app = await boot();
    const { headers } = await signUpAndFund(app);
    const bad = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...headers, "idempotency-key": "bad-i2v" },
      payload: {
        ...t2vBody,
        generationMode: "image_to_video",
        prompt: "",
        motionPrompt: "petals falling",
        refImage: "data:image/png;base64,iVBORw0KGgo=",
        durationSeconds: 3,
      },
    });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...headers, "idempotency-key": "t2v-3s" },
      payload: { ...t2vBody, durationSeconds: 3 },
    });
    expect(ok.statusCode).toBe(202);
    expect(ok.json().priceCredits).toBe(40);
  });

  it("validates I2V source ownership and animates a successful owned creation", async () => {
    const app = await boot();
    const { headers } = await signUpAndFund(app);

    // Seed a real image creation through the existing static pipeline.
    const imageJob = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...headers, "idempotency-key": "source-image" },
      payload: { prompt: "an anime girl under cherry blossoms", device: "phone", styleId: "anime" },
    });
    expect(imageJob.statusCode).toBe(202);
    await runWorkerOnce(
      db,
      { provider: new MockJobProvider(), storage, mock: true, generationMode: "mock" },
      "static-worker"
    );

    const video = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...headers, "idempotency-key": "i2v-from-creation" },
      payload: {
        ...t2vBody,
        generationMode: "image_to_video",
        prompt: "",
        motionPrompt: "Cherry petals fall slowly; hair sways in a light breeze; camera stays locked.",
        sourceCreationId: imageJob.json().jobId,
      },
    });
    expect(video.statusCode).toBe(202);
    expect(video.json().priceCredits).toBe(40);

    await runWorkerOnce(
      db,
      {
        provider: new MockJobProvider(),
        videoProviders: createMockVideoProviders(),
        storage,
        mock: true,
        generationMode: "mock",
      },
      "video-worker"
    );
    const status = await app.inject({
      method: "GET",
      url: `/v1/generations/jobs/${video.json().jobId}`,
      headers,
    });
    expect(status.json()).toMatchObject({
      status: "succeeded",
      mediaType: "video",
      durationSeconds: 5,
    });
    expect(status.json().posterUrl).toContain("/poster?");

    const missing = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...headers, "idempotency-key": "i2v-missing" },
      payload: {
        ...t2vBody,
        generationMode: "image_to_video",
        prompt: "",
        motionPrompt: "petals",
        sourceCreationId: "00000000-0000-0000-0000-000000000000",
      },
    });
    expect(missing.statusCode).toBe(400);
  });

  it("keeps video unavailable when no adapter is wired", async () => {
    const app = await boot({ video: false, generationMode: "disabled" });
    const { headers } = await signUpAndFund(app);
    const pricing = await app.inject({ method: "GET", url: "/v1/credits/pricing" });
    expect(pricing.json().video.available).toBe(false);
    const job = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...headers, "idempotency-key": "no-video" },
      payload: t2vBody,
    });
    expect(job.statusCode).toBe(503);
  });

  it("captures the separate video price in live mode and releases on provider failure", async () => {
    const app = await boot({ generationMode: "live" });
    const { headers } = await signUpAndFund(app);
    const job = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...headers, "idempotency-key": "live-video-1" },
      payload: { ...t2vBody, durationSeconds: 5 },
    });
    expect(job.statusCode).toBe(202);
    expect(job.json().priceCredits).toBe(60);
    expect((await app.inject({ method: "GET", url: "/v1/credits/wallet", headers })).json()).toMatchObject({
      credits: 200,
      reserved: 60,
    });

    await runWorkerOnce(
      db,
      {
        provider: new MockJobProvider(),
        videoProviders: createMockVideoProviders(),
        storage,
        generationMode: "live",
        mock: false,
      },
      "live-video-worker"
    );
    expect((await app.inject({ method: "GET", url: "/v1/credits/wallet", headers })).json()).toMatchObject({
      credits: 140,
      reserved: 0,
    });
    expect(
      (await db.query("SELECT spent FROM generation_budgets WHERE scope='user' AND scope_id=$1", [
        (await db.query<{ id: string }>("SELECT id FROM users ORDER BY created_at DESC LIMIT 1")).rows[0].id,
      ])).rows[0].spent
    ).toBe(800_000);

    const failingProviders = {
      imageToVideo: { providerId: "fail-i2v", generate: async () => { throw new Error("provider down"); } },
      textToVideo: { providerId: "fail-t2v", generate: async () => { throw new Error("provider down"); } },
    };
    const failing = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...headers, "idempotency-key": "live-video-fail" },
      payload: { ...t2vBody, durationSeconds: 3 },
    });
    expect(failing.statusCode).toBe(202);
    expect(failing.json().priceCredits).toBe(40);
    await runWorkerOnce(
      db,
      {
        provider: new MockJobProvider(),
        videoProviders: failingProviders,
        storage,
        generationMode: "live",
        mock: false,
      },
      "live-video-fail"
    );
    const failedStatus = await app.inject({
      method: "GET",
      url: `/v1/generations/jobs/${failing.json().jobId}`,
      headers,
    });
    expect(failedStatus.json()).toMatchObject({ status: "failed", errorCode: "UPSTREAM_ERROR" });
    expect((await app.inject({ method: "GET", url: "/v1/credits/wallet", headers })).json()).toMatchObject({
      credits: 140,
      reserved: 0,
    });
  });


  it("does not call a video provider again after a live lease reclaim", async () => {
    const app = await boot({ generationMode: "live" });
    const { headers } = await signUpAndFund(app);
    const job = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...headers, "idempotency-key": "reclaim-video" },
      payload: t2vBody,
    });
    expect(job.statusCode).toBe(202);
    const stale = (await claimJob(db, { workerId: "dead-video", leaseSeconds: 1 }))!;
    await db.query(
      "UPDATE generation_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
      [stale.jobId]
    );
    let calls = 0;
    const counted = {
      imageToVideo: { providerId: "count-i2v", generate: async () => { calls += 1; throw new Error("must not run"); } },
      textToVideo: { providerId: "count-t2v", generate: async () => { calls += 1; throw new Error("must not run"); } },
    };
    await runWorkerOnce(
      db,
      {
        provider: new MockJobProvider(),
        videoProviders: counted,
        storage,
        generationMode: "live",
        mock: false,
      },
      "alive-video"
    );
    expect(calls).toBe(0);
    const status = await app.inject({
      method: "GET",
      url: `/v1/generations/jobs/${job.json().jobId}`,
      headers,
    });
    expect(status.json()).toMatchObject({ status: "failed", errorCode: "UPSTREAM_UNCERTAIN" });
    expect((await app.inject({ method: "GET", url: "/v1/credits/wallet", headers })).json()).toMatchObject({
      credits: 200,
      reserved: 0,
    });
  });

});
