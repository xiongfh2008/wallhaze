/**
 * Full commercialization E2E (launch task 9) — isolated DB, Mock PSP,
 * in-process providers at LIVE billing semantics. Zero network calls.
 *
 * signup → buy 100 Credits (mock webhook) →
 *   text-to-image (−10) → image EDIT (−10) →
 *   provider-failure release (±0) →
 *   text-to-video 3s (−40) → image-to-video 5s from our own t2i result (−40) →
 *   wallet exactly 0 → insufficient-funds rejection (never negative) →
 *   preview + download (image & video, owner-scoped signed URLs) →
 *   duplicate payment webhook is a no-op → full ledger assertion.
 *
 * Run from apps/api: npx tsx tests/full-commerce-e2e.ts
 */
import { createMemoryDatabase } from "../src/db/database.js";
import { migrate } from "../src/db/migrate.js";
import { buildApp } from "../src/app.js";
import { signMockEvent } from "../src/business/payment.js";
import { createMockVideoProviders } from "../src/modules/generation/video.providers.js";
import { runWorkerOnce, type WorkerDeps } from "../src/business/worker.js";
import { MockJobProvider, type JobProvider } from "../src/business/providers.js";
import { MemoryStorage } from "../src/business/storage.js";
import { PromptModerationService } from "../src/business/moderation.js";
import { FalNsfwModerationService } from "../src/business/fal-nsfw-moderation.js";
import { PNG_HEADER, PNG_DATA_URI } from "./helpers.js";
import { generateKeyPairSync } from "node:crypto";

const SECRET = "full-e2e-secret";
const ORIGIN = "https://web.example";
const WEB = {
  "x-wallhaze-client": "web",
  "content-type": "application/json",
  origin: ORIGIN,
};
const PNG_BYTES = Buffer.from(PNG_HEADER);

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const passModeration = () =>
  new PromptModerationService({
    merchantId: "MER_e2e",
    privateKey: PRIVATE_KEY_PEM,
    fetcher: async () =>
      new Response(JSON.stringify({ data: { action: "allow", requestId: "REQ_E2E" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });

// fal NSFW backend (default since the OpenAI-dependency removal): every
// generated image/frame screens clean via the injected fetcher.
const passOutputModeration = () =>
  new FalNsfwModerationService({
    falKey: "e2e-fal-key",
    frameExtractor: async () => [PNG_BYTES, PNG_BYTES, PNG_BYTES],
    fetcher: async () =>
      new Response(JSON.stringify({ nsfw_probability: 0.01 }), { status: 200 }),
  });

const failingProvider = (): JobProvider => ({
  async generate() {
    throw new Error("SIMULATED_PROVIDER_FAILURE");
  },
});



const db = await createMemoryDatabase();
await migrate(db);
const storage = new MemoryStorage();
const { app } = await buildApp({
  env: {
    CORS_ALLOWED_ORIGINS: ORIGIN,
    PAYMENT_MOCK_SECRET: SECRET,
    PAYMENT_PROVIDER: "mock",
    PURCHASES_PUBLIC_ENABLED: "1",
    STUDIO_PUBLIC_ENABLED: "1",
    VIDEO_PUBLIC_ENABLED: "1",
    FAL_LIVE_ENABLED: "1",
    FAL_KEY: "e2e-no-network",
  },
  database: db,
  storage,
  paymentSecret: SECRET,
  userDailyCostLimitMicros: 50_000_000,
  videoProviders: createMockVideoProviders(),
  outputModeration: passOutputModeration(),
});

const liveDeps = (): WorkerDeps => ({
  provider: new MockJobProvider(),
  videoProviders: createMockVideoProviders(),
  storage,
  generationMode: "live" as const,
  mock: false,
  moderation: passModeration(),
  outputModeration: passOutputModeration(),
});

let step = 0;
const log = (msg: string) => console.log(`${++step}. ${msg}`);
const fail = (msg: string): never => {
  console.error(`FAIL at step ${step}: ${msg}`);
  process.exit(1);
};

// 1. Sign up
const signup = await app.inject({
  method: "POST",
  url: "/v1/auth/signup",
  headers: WEB,
  payload: { email: "full-e2e@wallhaze.test", password: "example-password-long" },
});
if (signup.statusCode !== 200) fail("signup " + signup.statusCode);
const auth = { ...WEB, cookie: signup.cookies.map((c) => `${c.name}=${c.value}`).join("; ") };
log(`signup 200 (${signup.cookies.length} cookies)`);

// 2. Pricing: image 10, i2v 5s=40, t2v 3/4/5=40/50/60
const pricing = (await app.inject({ method: "GET", url: "/v1/credits/pricing" })).json();
const videoModes = pricing.video.modes;
if (pricing.creditsPerGeneration !== 10) fail("image price");
if (videoModes.image_to_video.creditsByDuration["5"] !== 40) fail("i2v price");
if (videoModes.text_to_video.creditsByDuration["3"] !== 40
  || videoModes.text_to_video.creditsByDuration["4"] !== 50
  || videoModes.text_to_video.creditsByDuration["5"] !== 60) fail("t2v prices");
log("pricing: image=10cr, i2v5s=40cr, t2v 3/4/5s=40/50/60cr");

// 3. Buy 100 Credits
const checkout = await app.inject({
  method: "POST",
  url: "/v1/payments/checkout",
  headers: { ...auth, "idempotency-key": "e2e-checkout" },
  payload: { packageId: "starter", successUrl: `${ORIGIN}/zh/credits`, cancelUrl: `${ORIGIN}/zh/credits` },
});
if (checkout.statusCode !== 200) fail("checkout " + checkout.statusCode);
const orderId = checkout.json().orderId;
const payPayload = JSON.stringify({
  id: "e2e-pay-1", type: "paid", orderId, paymentId: "e2e-pay-1", amountMinor: 500, currency: "USD",
});
const webhook = await app.inject({
  method: "POST",
  url: "/v1/payments/webhook",
  headers: { ...WEB, "x-mock-signature": signMockEvent(payPayload, SECRET) },
  payload: payPayload,
});
if (webhook.json().applied !== true) fail("webhook not applied");
const walletAfterBuy = (await app.inject({ method: "GET", url: "/v1/credits/wallet", headers: auth })).json();
if (walletAfterBuy.credits !== 100) fail("credits after buy " + walletAfterBuy.credits);
log("purchase applied → 100 credits");

// 3b. Duplicate payment webhook (same event id) is a no-op
const dup = await app.inject({
  method: "POST",
  url: "/v1/payments/webhook",
  headers: { ...WEB, "x-mock-signature": signMockEvent(payPayload, SECRET) },
  payload: payPayload,
});
if (dup.json().applied !== false) fail("duplicate webhook applied twice");
log("duplicate payment webhook ignored (credits-once)");

const wallet = async () => {
  const w = (await app.inject({ method: "GET", url: "/v1/credits/wallet", headers: auth })).json();
  return { credits: w.credits, reserved: w.reserved };
};

async function runImageJob(key: string, extra: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/generations/jobs",
    headers: { ...auth, "idempotency-key": key },
    payload: { prompt: "a serene mountain lake at dawn", device: "phone", ...extra },
  });
  return res;
}

async function runVideoJob(key: string, mode: "text_to_video" | "image_to_video", extra: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/v1/generations/jobs",
    headers: { ...auth, "idempotency-key": key },
    payload: {
      mediaType: "video",
      generationMode: mode,
      prompt: "gentle clouds drifting over violet peaks",
      styleId: "anime-fantasy",
      device: "phone",
      aspectRatio: "9:16",
      durationSeconds: mode === "image_to_video" ? 5 : 3,
      ...extra,
    },
  });
}

async function workerOnce(deps = liveDeps()) {
  return runWorkerOnce(db, deps, "full-e2e-worker");
}

async function jobStatus(jobId: string) {
  const res = await app.inject({ method: "GET", url: `/v1/generations/jobs/${jobId}`, headers: auth });
  return res.json();
}

// 4. Text-to-image (−10)
let res = await runImageJob("e2e-t2i");
if (res.statusCode !== 202) fail("t2i create " + res.statusCode);
const t2iId = res.json().jobId;
if ((await wallet()).reserved !== 10) fail("t2i reserve");
if ((await workerOnce()) !== true) fail("t2i worker");
const t2i = await jobStatus(t2iId);
if (t2i.status !== "succeeded" || !t2i.imageUrl) fail("t2i " + t2i.status);
if ((await wallet()).credits !== 90) fail("t2i capture " + JSON.stringify(await wallet()));
log("text-to-image succeeded → captured 10 → 90 credits (signed preview URL ok)");

// 5. Image EDIT with reference image (−10)
res = await runImageJob("e2e-edit", { refImage: PNG_DATA_URI, prompt: "make the lake glow at dusk" });
if (res.statusCode !== 202) fail("edit create " + res.statusCode);
const editId = res.json().jobId;
if ((await workerOnce()) !== true) fail("edit worker");
const edit = await jobStatus(editId);
if (edit.status !== "succeeded" || !edit.imageUrl) fail("edit " + edit.status);
if ((await wallet()).credits !== 80) fail("edit capture");
log("image edit (ref image screened + allowed) succeeded → captured 10 → 80 credits");

// 6. Provider failure releases the hold (±0)
res = await runImageJob("e2e-fail");
if (res.statusCode !== 202) fail("fail-job create");
const failId = res.json().jobId;
const failing: WorkerDeps = { ...liveDeps(), provider: failingProvider() };
failing.outputModeration = undefined;
if ((await workerOnce(failing)) !== true) fail("failing worker");
const failed = await jobStatus(failId);
if (failed.status !== "failed") fail("expected failed, got " + failed.status);
const wAfterFail = await wallet();
if (wAfterFail.credits !== 80 || wAfterFail.reserved !== 0) fail("release " + JSON.stringify(wAfterFail));
log("provider failure → job failed, hold released → still 80 credits, no debt");

// 7. Text-to-video 3s (−40)
res = await runVideoJob("e2e-t2v", "text_to_video");
if (res.statusCode !== 202) fail("t2v create " + res.statusCode);
if (res.json().priceCredits !== 40) fail("t2v price " + res.json().priceCredits);
const t2vId = res.json().jobId;
if ((await workerOnce()) !== true) fail("t2v worker");
const t2v = await jobStatus(t2vId);
if (t2v.status !== "succeeded" || !t2v.videoUrl) fail("t2v " + t2v.status + " " + (t2v.errorCode ?? ""));
if (t2v.durationSeconds !== 3) fail("t2v duration " + t2v.durationSeconds);
if ((await wallet()).credits !== 40) fail("t2v capture");
log("text-to-video 3s succeeded → captured 40 → 40 credits (MP4 + signed video URL)");

// 8. Image-to-video 5s from our own t2i result (−40)
res = await runVideoJob("e2e-i2v", "image_to_video", { sourceCreationId: t2iId, durationSeconds: 5 });
if (res.statusCode !== 202) fail("i2v create " + res.statusCode);
if (res.json().priceCredits !== 40) fail("i2v price");
const i2vId = res.json().jobId;
if ((await workerOnce()) !== true) fail("i2v worker");
const i2v = await jobStatus(i2vId);
if (i2v.status !== "succeeded" || !i2v.videoUrl) fail("i2v " + i2v.status + " " + (i2v.errorCode ?? ""));
const wFinal = await wallet();
if (wFinal.credits !== 0 || wFinal.reserved !== 0) fail("final wallet " + JSON.stringify(wFinal));
log("image-to-video 5s (source = our t2i result) succeeded → captured 40 → exactly 0 credits");

// 9. Insufficient funds: next job must be rejected, wallet never negative
res = await runImageJob("e2e-broke");
if (res.statusCode === 202) fail("job accepted with 0 balance");
if (wFinal.credits < 0 || (await wallet()).credits !== 0) fail("wallet went negative");
log(`job with 0 balance rejected (${res.statusCode} ${res.json().error?.code ?? ""}) — wallet never negative`);

// 10. My creations + preview + downloads (owner-scoped signed URLs)
const creations = (await app.inject({ method: "GET", url: "/v1/creations", headers: auth })).json();
const ids: string[] = creations.items.map((c: { id: string }) => c.id);
if (!ids.includes(t2iId) || !ids.includes(editId) || !ids.includes(t2vId) || !ids.includes(i2vId)) {
  fail("creations list missing jobs: " + ids.join(","));
}
const imgDl = await app.inject({ method: "GET", url: `/v1/creations/${t2iId}/download`, headers: auth });
if (imgDl.statusCode !== 200 || !imgDl.json().url) fail("image download url");
const imgBytes = await app.inject({ method: "GET", url: imgDl.json().url, headers: auth });
if (imgBytes.statusCode !== 200) fail("image bytes " + imgBytes.statusCode);
const vidDl = await app.inject({ method: "GET", url: `/v1/creations/${t2vId}/download`, headers: auth });
if (vidDl.statusCode !== 200 || !vidDl.json().url) fail("video download url");
const vidBytes = await app.inject({ method: "GET", url: vidDl.json().url, headers: auth });
if (vidBytes.statusCode !== 200) fail("video bytes " + vidBytes.statusCode);
log(`creations list 4/4; downloads 200 (image ${imgBytes.statusCode}, video ${vidBytes.statusCode}, owner-scoped signed URLs)`);

// 11. Ledger: exact sequence
const ledger = (await app.inject({ method: "GET", url: "/v1/credits/transactions", headers: auth })).json();
// The transactions endpoint returns newest-first (ORDER BY created_at DESC).
const reasons = ledger.map((t: { reason: string }) => t.reason).reverse();
const expected = [
  "purchase",
  "generation.reserved", "generation.captured",              // t2i
  "generation.reserved", "generation.captured",              // edit
  "generation.reserved", "generation.released",              // failure
  "generation.reserved", "generation.captured",              // t2v
  "generation.reserved", "generation.captured",              // i2v
];
if (JSON.stringify(reasons) !== JSON.stringify(expected)) {
  fail("ledger sequence:\n  got      " + JSON.stringify(reasons) + "\n  expected " + JSON.stringify(expected));
}
const dbState = {
  orders: (await db.query("SELECT count(*)::int AS n FROM payment_orders")).rows[0].n,
  events: (await db.query("SELECT count(*)::int AS n FROM payment_webhook_events")).rows[0].n,
  jobs: (await db.query("SELECT count(*)::int AS n FROM generation_jobs WHERE status='succeeded'")).rows[0].n,
  failed: (await db.query("SELECT count(*)::int AS n FROM generation_jobs WHERE status='failed'")).rows[0].n,
  assets: (await db.query("SELECT count(*)::int AS n FROM image_assets")).rows[0].n,
  captured: (await db.query("SELECT count(*)::int AS n FROM credit_ledger WHERE reason='generation.captured'")).rows[0].n,
};
if (dbState.orders !== 1 || dbState.events !== 1 || dbState.jobs !== 4 || dbState.failed !== 1
  || dbState.assets !== 4 || dbState.captured !== 4) {
  fail("db state " + JSON.stringify(dbState));
}
log("ledger sequence exact (purchase + 4×reserve/capture + 1×release); DB: 1 order, 1 webhook event, 4 succeeded jobs, 1 failed, 4 assets, 4 captures");

await app.close();
await db.close();
console.log("\nFULL_COMMERCE_E2E_PASS (fal NSFW backend) — 100cr = t2i(10) + edit(10) + t2v3s(40) + i2v5s(40), failure released, no double-charge, no overdraft");
process.exit(0);
