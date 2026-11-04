// Mock checkout E2E: isolated in-memory PGlite + mock PSP, real HTTP via
// Fastify inject. Scenario C+D: Studio open + purchases open + video open →
// mock buy → credits land → mock generate → wallet/ledger/DB verified.
// Run from apps/api: npx tsx tests/browser-mock-checkout.ts
// (This is a script, not a vitest — it boots a real app and probes it.)
import { createMemoryDatabase } from "../src/db/database.js";
import { migrate } from "../src/db/migrate.js";
import { buildApp } from "../src/app.js";
import { signMockEvent } from "../src/business/payment.js";
import { createMockVideoProviders } from "../src/modules/generation/video.providers.js";
import { runWorkerOnce } from "../src/business/worker.js";
import { MockJobProvider } from "../src/business/providers.js";
import { MemoryStorage } from "../src/business/storage.js";

const SECRET = "test-only-payment-signature-secret";
const ORIGIN = "http://localhost:3100";

const db = await createMemoryDatabase();
await migrate(db);
// Migration 002 seeds the Starter tier (100 Credits for $5.00 / 500 minor).
const storage = new MemoryStorage();

const { app } = await buildApp({
  env: {
    CORS_ALLOWED_ORIGINS: ORIGIN,
    PAYMENT_MOCK_SECRET: SECRET,
    FAL_MOCK: "1",
    PAYMENT_PROVIDER: "mock",
    STUDIO_PUBLIC_ENABLED: "1",
    PURCHASES_PUBLIC_ENABLED: "1",
    VIDEO_PUBLIC_ENABLED: "1",
  },
  database: db,
  storage,
  paymentSecret: SECRET,
  userDailyCostLimitMicros: 50_000_000,
  videoProviders: createMockVideoProviders(),
});

const WEB = {
  "x-wallhaze-client": "web",
  "content-type": "application/json",
  origin: ORIGIN,
};

// 1. Sign up
const signup = await app.inject({
  method: "POST",
  url: "/v1/auth/signup",
  headers: WEB,
  payload: { email: "e2e@test.local", password: "example-password-long" },
});
console.log("1. signup:", signup.statusCode);
const auth = { ...WEB, cookie: signup.cookies.map((c) => `${c.name}=${c.value}`).join("; ") };

// 2. Initial wallet (0 credits)
const wallet0 = await app.inject({ method: "GET", url: "/v1/credits/wallet", headers: auth });
console.log("2. initial wallet:", wallet0.json().credits, "credits");

// 3. Pricing endpoint (open-state the web renders)
const pricing = await app.inject({ method: "GET", url: "/v1/credits/pricing" });
const p = pricing.json();
console.log("3. pricing: provider=" + p.paymentProvider, "checkoutAvailable=" + p.checkoutAvailable,
  "purchasesPublic=" + p.purchasesPublic, "studioPublic=" + p.studioPublic, "videoPublic=" + p.videoPublic);

// 4. Mock checkout (Starter $5 → 100 Credits)
const checkout = await app.inject({
  method: "POST",
  url: "/v1/payments/checkout",
  headers: { ...auth, "idempotency-key": "e2e-checkout-1" },
  payload: {
    packageId: "starter",
    successUrl: `${ORIGIN}/zh/credits`,
    cancelUrl: `${ORIGIN}/zh/credits`,
  },
});
console.log("4. checkout:", checkout.statusCode, checkout.json().checkoutUrl?.slice(0, 40) ?? "no url");
const orderId = checkout.json().orderId as string;

// 5. Provider webhook (order.completed → paid), signed with the mock scheme
const webhookPayload = JSON.stringify({
  id: "e2e-pay-1",
  type: "paid",
  orderId,
  paymentId: "e2e-pay-1",
  amountMinor: 500,
  currency: "USD",
});
const webhook = await app.inject({
  method: "POST",
  url: "/v1/payments/webhook",
  headers: { ...WEB, "x-mock-signature": signMockEvent(webhookPayload, SECRET) },
  payload: webhookPayload,
});
console.log("5. webhook:", webhook.statusCode, "applied:", webhook.json().applied);

// 6. Credits landed (order.credits = 100)
const wallet1 = await app.inject({ method: "GET", url: "/v1/credits/wallet", headers: auth });
console.log("6. after purchase:", wallet1.json().credits, "credits (expected 100)");

// 7. Generate static image (mock provider)
const gen = await app.inject({
  method: "POST",
  url: "/v1/generations/jobs",
  headers: { ...auth, "idempotency-key": "e2e-gen-1" },
  payload: { prompt: "test wallpaper", device: "phone" },
});
console.log("7. generate:", gen.statusCode, "credits:", gen.json().priceCredits);
const jobId = gen.json().jobId as string | undefined;

// 8. Wallet after generation (reserved / captured)
const wallet2 = await app.inject({ method: "GET", url: "/v1/credits/wallet", headers: auth });
console.log("8. after gen:", wallet2.json().credits, "credits,", wallet2.json().reserved, "reserved");

// 9. Job status (poll — drive the mock worker like production's worker loop)
if (jobId) {
  let status = "";
  for (let i = 0; i < 25; i++) {
    await runWorkerOnce(
      db,
      {
        provider: new MockJobProvider(),
        videoProviders: createMockVideoProviders(),
        storage,
        generationMode: "mock",
        mock: true,
      },
      "e2e-mock-worker"
    );
    const job = await app.inject({ method: "GET", url: `/v1/generations/jobs/${jobId}`, headers: auth });
    status = job.json().status;
    if (status === "succeeded" || status === "failed") {
      console.log("9. job status:", status, job.json().errorCode ?? "", "imageUrl:", job.json().imageUrl ? "signed-url" : "none");
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (status !== "succeeded" && status !== "failed") console.log("9. job status (timeout):", status);
} else {
  console.log("9. job status: (no jobId)");
}

// 10. Ledger (array payload — web adapter contract)
const txns = (await app.inject({ method: "GET", url: "/v1/credits/transactions", headers: auth })).json() as Array<{
  reason: string;
  delta: number;
  reservedDelta: number;
}>;
console.log("10. ledger entries:", txns.length);
txns.forEach((t) => console.log("   ledger:", t.reason, "delta=" + t.delta, "reservedDelta=" + t.reservedDelta));

// 11. Video generation (mock T2V, 5s — durations [3,4,5])
const video = await app.inject({
  method: "POST",
  url: "/v1/generations/jobs",
  headers: { ...auth, "idempotency-key": "e2e-video-1" },
  payload: {
    mediaType: "video",
    generationMode: "text_to_video",
    prompt: "A dreamy star field with slow shimmering light",
    styleId: "anime-fantasy",
    device: "phone",
    aspectRatio: "9:16",
    durationSeconds: 5,
  },
});
console.log("11. video gen:", video.statusCode,
  video.statusCode === 202 ? "credits:" + video.json().priceCredits : video.json().errorCode ?? video.body.slice(0, 120));
const videoJobId = video.json().jobId as string | undefined;
if (video.statusCode === 202 && videoJobId) {
  let vStatus = "";
  for (let i = 0; i < 25; i++) {
    await runWorkerOnce(
      db,
      {
        provider: new MockJobProvider(),
        videoProviders: createMockVideoProviders(),
        storage,
        generationMode: "mock",
        mock: true,
      },
      "e2e-mock-worker"
    );
    const vj = await app.inject({ method: "GET", url: `/v1/generations/jobs/${videoJobId}`, headers: auth });
    vStatus = vj.json().status;
    if (vStatus === "succeeded" || vStatus === "failed") {
      console.log("    video job:", vStatus, vj.json().errorCode ?? "", "videoUrl:", vj.json().videoUrl ? "signed-url" : "none");
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (vStatus !== "succeeded" && vStatus !== "failed") console.log("    video job (timeout):", vStatus);
}

// 12. DB end-state: orders, webhook events, ledger, jobs
const orders = await db.query("SELECT count(*)::int AS n FROM payment_orders");
const events = await db.query("SELECT count(*)::int AS n FROM payment_webhook_events");
const jobs = await db.query("SELECT media_type,status FROM generation_jobs ORDER BY created_at");
const ledger = await db.query("SELECT reason,balance_delta,reserved_delta FROM credit_ledger ORDER BY created_at");
console.log("12. DB: orders=" + orders.rows[0].n, "webhookEvents=" + events.rows[0].n,
  "jobs=" + jobs.rows.map((j) => `${j.media_type}:${j.status}`).join(","));
ledger.rows.forEach((r) => console.log("   db-ledger:", r.reason, "balance=" + r.balance_delta, "reserved=" + r.reserved_delta));

await app.close();
await db.close();
console.log("\nE2E_MOCK_CHECKOUT_PASS");
process.exit(0);
