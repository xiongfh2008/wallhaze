/**
 * Real capture semantics against a simulated provider (launch closure task 2).
 *
 * The full commercial loop is exercised at LIVE billing semantics with a
 * provider that never touches the network: MockJobProvider /
 * createMockVideoProviders() under a live-mode worker (mock: false), with
 * injected pass-through moderation fetchers. No fal.ai call can happen —
 * the provider is in-process and the moderation fetchers are local stubs.
 *
 * Flow: buy 100 Credits (mock PSP webhook) → image job reserves 10 →
 * provider succeeds → CAPTURE 10 → video job reserves 60 → succeeds →
 * CAPTURE 60 → wallet must be exactly 100 - 10 - 60 = 30.
 *
 * Also proven: duplicate settlement cannot double-charge (terminal
 * reservation + fenced completeJob), failure releases the hold, and the
 * MOCK worker still charges nothing (reservation-only, released).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { buildApp } from "../src/app.js";
import { createMemoryDatabase, type Database } from "../src/db/database.js";
import { migrate } from "../src/db/migrate.js";
import { runWorkerOnce } from "../src/business/worker.js";
import { MockJobProvider, type JobProvider } from "../src/business/providers.js";
import { createMockVideoProviders } from "../src/modules/generation/video.providers.js";
import { MemoryStorage } from "../src/business/storage.js";
import { PromptModerationService } from "../src/business/moderation.js";
import { OutputModerationService } from "../src/business/output-moderation.js";
import { MockPaymentAdapter, signMockEvent } from "../src/business/payment.js";
import { getWallet } from "../src/business/wallet.js";
import { PNG_HEADER } from "./helpers.js";
import type { FastifyInstance } from "fastify";

/** Frame bytes for the video frame-extraction stub (no local ffmpeg need). */
const PNG_BYTES = Buffer.from(PNG_HEADER);

const SECRET = "test-only-payment-signature-secret";
const ORIGIN = "https://web.example";
const WEB = {
  "x-wallhaze-client": "web",
  "content-type": "application/json",
  origin: ORIGIN,
};

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

/** Pass-through Prompt Sift: every prompt allowed, zero network. */
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

/** Pass-through output moderation: never flagged, zero network. The frame
 * extractor stub stands in for ffmpeg so video screening stays testable. */
const passOutputModeration = () =>
  new OutputModerationService({
    apiKey: "test-key",
    frameExtractor: async () => [PNG_BYTES, PNG_BYTES, PNG_BYTES],
    fetcher: async () =>
      new Response(
        JSON.stringify({ results: [{ flagged: false, categories: {} }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
  });

/** Provider that always fails — exercises the release path. */
const failingProvider = (): JobProvider => ({
  async generate() {
    throw new Error("SIMULATED_PROVIDER_FAILURE");
  },
});

let db: Database;
let app: FastifyInstance;
let cleanup: (() => Promise<void>) | undefined;
let cookie: string;
let userId: string;

beforeEach(async () => {
  db = await createMemoryDatabase();
  await migrate(db);
  const storage = new MemoryStorage();
  const built = await buildApp({
    env: {
      CORS_ALLOWED_ORIGINS: ORIGIN,
      PAYMENT_MOCK_SECRET: SECRET,
      PAYMENT_PROVIDER: "mock",
      PURCHASES_PUBLIC_ENABLED: "1",
      // LIVE billing semantics; the provider below is still in-process.
      FAL_LIVE_ENABLED: "1",
      FAL_KEY: "test-key-no-network",
      STUDIO_PUBLIC_ENABLED: "1",
      VIDEO_PUBLIC_ENABLED: "1",
    },
    database: db,
    storage,
    paymentSecret: SECRET,
    videoProviders: createMockVideoProviders(),
    outputModeration: passOutputModeration(),
  });
  app = built.app;
  cleanup = () => app.close();

  // Sign up and buy 100 Credits through the real mock-PSP pipeline.
  const signup = await app.inject({
    method: "POST",
    url: "/v1/auth/signup",
    headers: WEB,
    payload: { email: "capture@example.test", password: "example-password-long" },
  });
  cookie = signup.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const userIdRow = await db.query<{ id: string }>("SELECT id FROM users LIMIT 1");
  userId = userIdRow.rows[0].id;

  // Migration 002 seeds the Starter tier (100 Credits / 500 minor).
  const checkout = await app.inject({
    method: "POST",
    url: "/v1/payments/checkout",
    headers: { ...cookieHeaders(), "idempotency-key": "cap-checkout-1" },
    payload: {
      packageId: "starter",
      successUrl: `${ORIGIN}/zh/credits`,
      cancelUrl: `${ORIGIN}/zh/credits`,
    },
  });
  expect(checkout.statusCode).toBe(200);
  const webhookPayload = JSON.stringify({
    id: "cap-pay-1",
    type: "paid",
    orderId: checkout.json().orderId,
    paymentId: "cap-pay-1",
    amountMinor: 500,
    currency: "USD",
  });
  const webhook = await app.inject({
    method: "POST",
    url: "/v1/payments/webhook",
    headers: { ...WEB, "x-mock-signature": signMockEvent(webhookPayload, SECRET) },
    payload: webhookPayload,
  });
  expect(webhook.json().applied).toBe(true);
  expect(await walletOf()).toEqual({ credits: 100, reserved: 0, debt: 0 });
});

afterEach(async () => {
  await cleanup?.();
  await db?.close();
});

function cookieHeaders() {
  return { ...WEB, cookie };
}

const walletOf = async () => {
  const w = await getWallet(db, userId);
  return { credits: w.credits, reserved: w.reserved, debt: w.debt };
};

const ledgerReasons = async () =>
  (
    await db.query<{ reason: string }>(
      "SELECT reason FROM credit_ledger WHERE user_id=$1 ORDER BY created_at,id",
      [userId]
    )
  ).rows.map((r) => r.reason);

/** Live-mode worker deps: real billing (mock: false), in-process providers. */
const liveWorkerDeps = () => ({
  provider: new MockJobProvider(),
  videoProviders: createMockVideoProviders(),
  storage: new MemoryStorage(),
  generationMode: "live" as const,
  mock: false,
  moderation: passModeration(),
  outputModeration: passOutputModeration(),
});

async function createImageJob(key: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/generations/jobs",
    headers: { ...cookieHeaders(), "idempotency-key": key },
    payload: { prompt: "a serene mountain lake at dawn", device: "phone" },
  });
  expect(res.statusCode).toBe(202);
  return res.json().jobId;
}

async function createVideoJob(key: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/generations/jobs",
    headers: { ...cookieHeaders(), "idempotency-key": key },
    payload: {
      mediaType: "video",
      generationMode: "text_to_video",
      prompt: "slow clouds over a violet starfield",
      styleId: "anime-fantasy",
      device: "phone",
      aspectRatio: "9:16",
      durationSeconds: 5,
    },
  });
  expect(res.statusCode).toBe(202);
  return res.json().jobId;
}

describe("capture semantics (simulated real provider, no network)", () => {
  it("buy 100 → capture 10 (image) → capture 60 (video) → exactly 30 left", async () => {
    // --- Image: reserve 10, provider succeeds, capture 10 ---
    const imageJob = await createImageJob("cap-image-1");
    expect(await walletOf()).toEqual({ credits: 100, reserved: 10, debt: 0 });
    expect(await runWorkerOnce(db, liveWorkerDeps(), "cap-worker")).toBe(true);
    const imageStatus = await app.inject({
      method: "GET",
      url: `/v1/generations/jobs/${imageJob}`,
      headers: cookieHeaders(),
    });
    expect(imageStatus.json().status).toBe("succeeded");
    expect(await walletOf()).toEqual({ credits: 90, reserved: 0, debt: 0 });

    // --- Video: reserve 60, provider succeeds, capture 60 ---
    const videoJob = await createVideoJob("cap-video-1");
    expect(await walletOf()).toEqual({ credits: 90, reserved: 60, debt: 0 });
    expect(await runWorkerOnce(db, liveWorkerDeps(), "cap-worker")).toBe(true);
    const videoStatus = await app.inject({
      method: "GET",
      url: `/v1/generations/jobs/${videoJob}`,
      headers: cookieHeaders(),
    });
    expect(videoStatus.json().status).toBe("succeeded");
    expect(videoStatus.json().videoUrl).toBeTruthy();

    // --- Final: 100 - 10 - 60 = 30 ---
    expect(await walletOf()).toEqual({ credits: 30, reserved: 0, debt: 0 });
    expect(await ledgerReasons()).toEqual([
      "purchase",
      "generation.reserved",
      "generation.captured",
      "generation.reserved",
      "generation.captured",
    ]);
    const amounts = await db.query<{ amount: number; reason: string }>(
      "SELECT amount,reason FROM credit_ledger WHERE user_id=$1 ORDER BY created_at,id",
      [userId]
    );
    expect(amounts.rows).toEqual([
      { amount: 100, reason: "purchase" },
      { amount: 10, reason: "generation.reserved" },
      { amount: 10, reason: "generation.captured" },
      { amount: 60, reason: "generation.reserved" },
      { amount: 60, reason: "generation.captured" },
    ]);
  });

  it("duplicate settlement cannot double-charge (terminal reservation + no re-claim)", async () => {
    const imageJob = await createImageJob("cap-dup-1");
    await runWorkerOnce(db, liveWorkerDeps(), "cap-worker");
    expect(await walletOf()).toEqual({ credits: 90, reserved: 0, debt: 0 });

    // The job is settled: the worker claims nothing more…
    expect(await runWorkerOnce(db, liveWorkerDeps(), "cap-worker")).toBe(false);
    // …and a direct second capture on the settled reservation is a no-op.
    const { capture } = await import("../src/business/wallet.js");
    await db.transaction(async (tx) => {
      await capture(tx, userId, imageJob);
      await capture(tx, userId, imageJob);
    });
    expect(await walletOf()).toEqual({ credits: 90, reserved: 0, debt: 0 });
    // Exactly ONE capture ledger row for the job.
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM credit_ledger WHERE reason='generation.captured' AND idempotency_key=$1",
          [`capture:${imageJob}`]
        )
      ).rows[0].n
    ).toBe(1);
  });

  it("a provider failure releases the hold — no charge, no debt", async () => {
    const imageJob = await createImageJob("cap-fail-1");
    expect(await walletOf()).toEqual({ credits: 100, reserved: 10, debt: 0 });
    const failing = {
      ...liveWorkerDeps(),
      provider: failingProvider(),
      // Output moderation must not run for a failed generation.
      outputModeration: undefined,
    };
    expect(await runWorkerOnce(db, failing, "cap-worker")).toBe(true);
    const status = await app.inject({
      method: "GET",
      url: `/v1/generations/jobs/${imageJob}`,
      headers: cookieHeaders(),
    });
    expect(status.json().status).toBe("failed");
    expect(status.json().errorCode).toBe("UPSTREAM_ERROR");
    expect(await walletOf()).toEqual({ credits: 100, reserved: 0, debt: 0 });
    expect(await ledgerReasons()).toEqual([
      "purchase",
      "generation.reserved",
      "generation.released",
    ]);
    // No asset was stored for the failed job.
    expect(
      (
        await db.query("SELECT count(*)::int AS n FROM image_assets WHERE job_id=$1", [
          imageJob,
        ])
      ).rows[0].n
    ).toBe(0);
  });

  it("MOCK mode still charges nothing: reserve → release, balance untouched", async () => {
    const imageJob = await createImageJob("cap-mock-1");
    expect(await walletOf()).toEqual({ credits: 100, reserved: 10, debt: 0 });
    const mockDeps = {
      provider: new MockJobProvider(),
      videoProviders: createMockVideoProviders(),
      storage: new MemoryStorage(),
      generationMode: "mock" as const,
      mock: true,
    };
    expect(await runWorkerOnce(db, mockDeps, "cap-worker")).toBe(true);
    const status = await app.inject({
      method: "GET",
      url: `/v1/generations/jobs/${imageJob}`,
      headers: cookieHeaders(),
    });
    expect(status.json().status).toBe("succeeded");
    // Balance unchanged — mock output is free by design.
    expect(await walletOf()).toEqual({ credits: 100, reserved: 0, debt: 0 });
    expect(await ledgerReasons()).toEqual(["purchase", "generation.reserved", "generation.mock"]);
    const captureRows = await db.query(
      "SELECT count(*)::int AS n FROM credit_ledger WHERE reason='generation.captured'"
    );
    expect(captureRows.rows[0].n).toBe(0);
  });
});
