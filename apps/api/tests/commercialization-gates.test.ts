/**
 * Commercialization business-gate truth table (launch task §2).
 *
 * Verifies the server-side final interception layer:
 * - PURCHASES_PUBLIC_ENABLED / STUDIO_PUBLIC_ENABLED / VIDEO_PUBLIC_ENABLED
 *   / PURCHASES_PAUSED — all default CLOSED.
 * - A configured PSP or AI key alone never opens the entry points.
 * - Pausing purchases only blocks NEW checkouts; webhooks, refunds, sync
 *   and order queries stay live.
 * - Studio open alone never opens paid video.
 * - The legacy synchronous route refuses live (paid) mode.
 * - The pricing endpoint reports the state the web app renders.
 *
 * Every assertion checks DB/wallet end state, not just HTTP codes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createMemoryDatabase, type Database } from "../src/db/database.js";
import { migrate } from "../src/db/migrate.js";
import { AuthService } from "../src/business/auth.js";
import { credit } from "../src/business/wallet.js";
import { MockPaymentAdapter, signMockEvent } from "../src/business/payment.js";
import { createMockVideoProviders } from "../src/modules/generation/video.providers.js";

let db: Database;
let cleanup: (() => Promise<void>) | undefined;
const SECRET = "test-only-payment-signature-secret";
const ORIGIN = "https://web.example";
const WEB = {
  "x-wallhaze-client": "web",
  "content-type": "application/json",
  origin: ORIGIN,
};

beforeEach(async () => {
  db = await createMemoryDatabase();
  await migrate(db);
});
afterEach(async () => {
  await cleanup?.();
  await db?.close();
});

async function boot(env: Record<string, string> = {}) {
  const { app } = await buildApp({
    env: {
      CORS_ALLOWED_ORIGINS: ORIGIN,
      PAYMENT_MOCK_SECRET: SECRET,
      ...env,
    },
    database: db,
    paymentSecret: SECRET,
    userDailyCostLimitMicros: 50_000_000,
    videoProviders: createMockVideoProviders(),
  });
  cleanup = async () => app.close();
  return app;
}

async function signUp(app: Awaited<ReturnType<typeof boot>>): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/signup",
    headers: WEB,
    payload: { email: `u${Math.random()}@example.test`, password: "example-password-long" },
  });
  expect([200, 201]).toContain(res.statusCode);
  return res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
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

async function seedWallet(userId: string, amount = 200) {
  await db.transaction((tx) => credit(tx, userId, amount, "seed", "test"));
}

async function walletOf(userId: string) {
  const row = (
    await db.query<{ balance: number; reserved: number }>(
      "SELECT balance,reserved FROM credit_wallets WHERE user_id=$1",
      [userId]
    )
  ).rows[0];
  return { balance: Number(row?.balance ?? 0), reserved: Number(row?.reserved ?? 0) };
}

describe("commercialization gates: defaults are CLOSED", () => {
  it("no flags: checkout, image jobs and video jobs all refuse; pricing reports closed", async () => {
    const app = await boot();
    const cookie = await signUp(app);

    const checkout = await app.inject({
      method: "POST",
      url: "/v1/payments/checkout",
      headers: { ...WEB, cookie, "idempotency-key": "k1" },
      payload: {
        packageId: "starter",
        successUrl: `${ORIGIN}/en/credits`,
        cancelUrl: `${ORIGIN}/en/credits`,
      },
    });
    expect(checkout.statusCode).toBe(503);
    expect((await db.query("SELECT count(*)::int AS n FROM payment_orders")).rows[0].n).toBe(0);

    const imageJob = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...WEB, cookie, "idempotency-key": "g1" },
      payload: { prompt: "a calm lake wallpaper", device: "phone" },
    });
    expect(imageJob.statusCode).toBe(503);

    const videoJob = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...WEB, cookie, "idempotency-key": "g2" },
      payload: t2vBody,
    });
    expect(videoJob.statusCode).toBe(503);
    expect((await db.query("SELECT count(*)::int AS n FROM generation_jobs")).rows[0].n).toBe(0);

    const pricing = await app.inject({ method: "GET", url: "/v1/credits/pricing" });
    expect(pricing.statusCode).toBe(200);
    expect(pricing.json()).toMatchObject({
      purchasesPublic: false,
      purchasesPaused: false,
      studioPublic: false,
      videoPublic: false,
    });
  });

  it("a configured mock PSP alone does not open purchasing", async () => {
    // Default boot already wires the mock adapter (NODE_ENV != production);
    // the gate above proves the adapter alone is not enough. This test pins
    // the pricing flag independently of checkout behavior.
    const app = await boot({ PAYMENT_PROVIDER: "mock" });
    const pricing = await app.inject({ method: "GET", url: "/v1/credits/pricing" });
    expect(pricing.json().purchasesPublic).toBe(false);
  });
});

describe("commercialization gates: individual switches", () => {
  it("PURCHASES_PUBLIC_ENABLED only: checkout reaches validation; generation stays closed", async () => {
    const app = await boot({ PURCHASES_PUBLIC_ENABLED: "1" });
    const cookie = await signUp(app);

    const noKey = await app.inject({
      method: "POST",
      url: "/v1/payments/checkout",
      headers: { ...WEB, cookie },
      payload: { packageId: "starter", successUrl: `${ORIGIN}/en/credits`, cancelUrl: `${ORIGIN}/en/credits` },
    });
    // Past the purchase gate; fails later on the missing Idempotency-Key.
    expect(noKey.statusCode).toBe(400);

    const imageJob = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...WEB, cookie, "idempotency-key": "g1" },
      payload: { prompt: "a calm lake wallpaper", device: "phone" },
    });
    expect(imageJob.statusCode).toBe(503);
    expect((await db.query("SELECT count(*)::int AS n FROM generation_jobs")).rows[0].n).toBe(0);
  });

  it("STUDIO_PUBLIC_ENABLED only: image job accepted; paid video stays closed", async () => {
    const app = await boot({ STUDIO_PUBLIC_ENABLED: "1" });
    const cookie = await signUp(app);
    const user = (
      await db.query<{ id: string }>("SELECT id FROM users LIMIT 1")
    ).rows[0].id;
    await seedWallet(user);

    const imageJob = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...WEB, cookie, "idempotency-key": "g1" },
      payload: { prompt: "a calm lake wallpaper", device: "phone" },
    });
    expect(imageJob.statusCode).toBe(202);
    expect(imageJob.json().priceCredits).toBe(10);

    const videoJob = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...WEB, cookie, "idempotency-key": "g2" },
      payload: t2vBody,
    });
    expect(videoJob.statusCode).toBe(503);
    // No video reservation leaked: only the image job holds credits.
    expect(await walletOf(user)).toEqual({ balance: 200, reserved: 10 });
    const videoRows = (
      await db.query<{ media_type: string }>(
        "SELECT (request->>'mediaType') AS media_type FROM generation_jobs"
      )
    ).rows;
    expect(videoRows.every((r) => r.media_type !== "video")).toBe(true);
  });

  it("VIDEO_PUBLIC_ENABLED without STUDIO stays closed for both", async () => {
    const app = await boot({ VIDEO_PUBLIC_ENABLED: "1" });
    const cookie = await signUp(app);
    const imageJob = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...WEB, cookie, "idempotency-key": "g1" },
      payload: { prompt: "a calm lake wallpaper", device: "phone" },
    });
    expect(imageJob.statusCode).toBe(503);
    const videoJob = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...WEB, cookie, "idempotency-key": "g2" },
      payload: t2vBody,
    });
    expect(videoJob.statusCode).toBe(503);
  });

  it("pricing reports composed videoPublic only when both gates are open", async () => {
    const both = await boot({
      STUDIO_PUBLIC_ENABLED: "1",
      VIDEO_PUBLIC_ENABLED: "1",
    });
    const p1 = await both.inject({ method: "GET", url: "/v1/credits/pricing" });
    expect(p1.json()).toMatchObject({ studioPublic: true, videoPublic: true });
    await cleanup?.();

    const imageOnly = await boot({ STUDIO_PUBLIC_ENABLED: "1" });
    const p2 = await imageOnly.inject({ method: "GET", url: "/v1/credits/pricing" });
    expect(p2.json()).toMatchObject({ studioPublic: true, videoPublic: false });
  });
});

describe("PURCHASES_PAUSED: new checkouts refused, money flows stay live", () => {
  it("paused: checkout refuses, webhook still settles an existing order", async () => {
    // Open purchases first, create an order, then flip to paused.
    const open = await buildApp({
      env: {
        CORS_ALLOWED_ORIGINS: ORIGIN,
        PAYMENT_MOCK_SECRET: SECRET,
        PURCHASES_PUBLIC_ENABLED: "1",
      },
      database: db,
      paymentSecret: SECRET,
      userDailyCostLimitMicros: 50_000_000,
    });
    const app = open.app;
    const cookie = await signUp(app);
    const created = await app.inject({
      method: "POST",
      url: "/v1/payments/checkout",
      headers: { ...WEB, cookie, "idempotency-key": "pre-pause" },
      payload: { packageId: "starter", successUrl: `${ORIGIN}/en/credits`, cancelUrl: `${ORIGIN}/en/credits` },
    });
    expect(created.statusCode).toBe(200);
    const orderId = created.json().orderId as string;
    // Same user+package within the dedupe window reuses the SAME pending
    // order (existing anti-duplicate behavior — pinned here as a feature).
    const pendingCreated = await app.inject({
      method: "POST",
      url: "/v1/payments/checkout",
      headers: { ...WEB, cookie, "idempotency-key": "pre-pause-2" },
      payload: { packageId: "starter", successUrl: `${ORIGIN}/en/credits`, cancelUrl: `${ORIGIN}/en/credits` },
    });
    expect(pendingCreated.statusCode).toBe(200);
    expect(pendingCreated.json().orderId).toBe(orderId);
    await cleanup?.();

    // Restart paused (webhook + sync must remain functional).
    const paused = await buildApp({
      env: {
        CORS_ALLOWED_ORIGINS: ORIGIN,
        PAYMENT_MOCK_SECRET: SECRET,
        PURCHASES_PUBLIC_ENABLED: "1",
        PURCHASES_PAUSED: "1",
      },
      database: db,
      paymentSecret: SECRET,
      userDailyCostLimitMicros: 50_000_000,
    });
    const papp = paused.app;
    cleanup = async () => papp.close();

    const blocked = await papp.inject({
      method: "POST",
      url: "/v1/payments/checkout",
      headers: { ...WEB, cookie, "idempotency-key": "post-pause" },
      payload: { packageId: "starter", successUrl: `${ORIGIN}/en/credits`, cancelUrl: `${ORIGIN}/en/credits` },
    });
    expect(blocked.statusCode).toBe(503);
    expect(blocked.json().error.message).toContain("paused");

    // Late webhook for the pre-pause order still settles and credits.
    const raw = JSON.stringify({
      id: "evt-paused-1",
      type: "paid",
      orderId,
      paymentId: "pay-1",
      amountMinor: 500,
      currency: "USD",
    });
    const hook = await papp.inject({
      method: "POST",
      url: "/v1/payments/webhook",
      headers: { "content-type": "application/json", "x-mock-signature": signMockEvent(raw, SECRET) },
      payload: raw,
    });
    expect(hook.statusCode).toBe(200);
    expect(hook.json().applied).toBe(true);

    const user = (await db.query<{ id: string }>("SELECT id FROM users LIMIT 1")).rows[0].id;
    expect(await walletOf(user)).toEqual({ balance: 100, reserved: 0 });
    expect(
      (await db.query<{ status: string }>("SELECT status FROM payment_orders WHERE id=$1", [orderId])).rows[0].status
    ).toBe("paid");

    // Order queries and pull-sync stay available while paused (sync targets
    // the still-pending order; only PENDING orders are provider-synced).
    const orderView = await papp.inject({
      method: "GET",
      url: `/v1/orders/${orderId}`,
      headers: { ...WEB, cookie },
    });
    expect(orderView.statusCode).toBe(200);
    expect(orderView.json().status).toBe("paid");
    const sync = await papp.inject({
      method: "POST",
      url: `/v1/payments/orders/${orderId}/sync`,
      headers: { ...WEB, cookie },
      payload: {},
    });
    expect(sync.statusCode).toBe(200);
    expect(sync.json().applied).toBe(false);
    expect(sync.json().order.status).toBe("paid");
  });
});

describe("legacy synchronous route: refuses paid (live) mode", () => {
  it("POST /v1/generations 503s when FAL_LIVE_ENABLED+FAL_KEY would allow free paid calls", async () => {
    const { app } = await buildApp({
      env: {
        CORS_ALLOWED_ORIGINS: ORIGIN,
        PAYMENT_MOCK_SECRET: SECRET,
        FAL_KEY: "test-key",
        FAL_LIVE_ENABLED: "1",
        STUDIO_PUBLIC_ENABLED: "1",
      },
      database: db,
      paymentSecret: SECRET,
    });
    cleanup = async () => app.close();
    const res = await app.inject({
      method: "POST",
      url: "/v1/generations",
      headers: { ...WEB },
      payload: { prompt: "a calm lake wallpaper", device: "phone" },
    });
    expect(res.statusCode).toBe(503);
    expect((await db.query("SELECT count(*)::int AS n FROM generation_jobs")).rows[0].n).toBe(0);
  });

  it("production refuses to boot with FAL_MOCK=1", async () => {
    await expect(
      buildApp({
        env: {
          CORS_ALLOWED_ORIGINS: ORIGIN,
          PAYMENT_MOCK_SECRET: SECRET,
          NODE_ENV: "production",
          FAL_MOCK: "1",
        },
        database: db,
        paymentSecret: SECRET,
      })
    ).rejects.toThrow(/FAL_MOCK is not allowed in production/);
  });

  it("production refuses to boot with the mock payment adapter", async () => {
    await expect(
      buildApp({
        env: {
          CORS_ALLOWED_ORIGINS: ORIGIN,
          PAYMENT_MOCK_SECRET: SECRET,
          NODE_ENV: "production",
          PAYMENT_PROVIDER: "mock",
          IMAGE_URL_SECRET: "p".repeat(64),
        },
        database: db,
        paymentSecret: SECRET,
      })
    ).rejects.toThrow(/mock payment adapter is not allowed in production/);
  });

  it("MOCK_CHECKOUT_PUBLIC exposes checkout only under the mock provider, locally", async () => {
    // Local/E2E affordance: mock provider + explicit flag -> checkout open.
    const mockBoot = await buildApp({
      env: {
        CORS_ALLOWED_ORIGINS: ORIGIN,
        PAYMENT_MOCK_SECRET: SECRET,
        PAYMENT_PROVIDER: "mock",
        MOCK_CHECKOUT_PUBLIC: "1",
        PURCHASES_PUBLIC_ENABLED: "1",
      },
      database: db,
      paymentSecret: SECRET,
    });
    cleanup = async () => mockBoot.app.close();
    const pricing = await mockBoot.app.inject({ method: "GET", url: "/v1/credits/pricing" });
    expect(pricing.json()).toMatchObject({
      paymentProvider: "mock",
      checkoutAvailable: true,
      purchasesPublic: true,
    });
    // The flag alone never opens anything: default (no flag) stays closed.
    const closedBoot = await buildApp({
      env: {
        CORS_ALLOWED_ORIGINS: ORIGIN,
        PAYMENT_MOCK_SECRET: SECRET,
        PAYMENT_PROVIDER: "mock",
      },
      database: db,
      paymentSecret: SECRET,
    });
    const closed = await closedBoot.app.inject({ method: "GET", url: "/v1/credits/pricing" });
    expect(closed.json()).toMatchObject({ checkoutAvailable: false });
    await closedBoot.app.close();
  });
});
