/**
 * Browser purchase closed-loop harness (launch closure task 4).
 *
 * Boots the REAL API app on 127.0.0.1:4000 against an isolated in-memory
 * PGlite so the local web dev server (:3100) can drive a genuine browser
 * purchase flow:
 *
 *   Pricing → Credits checkout (mock PSP) → Mock Paid (webhook) →
 *   Credits land → AI Studio generate → Credits captured (90 left)
 *
 * Production safety is unchanged: the buy buttons are only enabled here by
 * MOCK_CHECKOUT_PUBLIC=1 (a local-only opt-in; PAYMENT_PROVIDER=mock refuses
 * to boot when NODE_ENV=production). Generation runs LIVE billing semantics
 * with in-process providers — zero network calls to fal.ai or Waffo.
 *
 * A tiny helper server on 127.0.0.1:4902 stands in for the mock PSP's
 * cashier back-end:
 *   GET  /state                 → orders + wallet snapshot (debug)
 *   POST /pay {orderId, email}  → signs + delivers the order.completed
 *                                 webhook exactly like the mock PSP would
 *
 * Run from apps/api:  npx tsx tests/browser-purchase-loop.ts
 * Stop with Ctrl-C (graceful close).
 */
import { createServer as createHttpServer } from "node:http";
import { createMemoryDatabase } from "../src/db/database.js";
import { migrate } from "../src/db/migrate.js";
import { buildApp } from "../src/app.js";
import { signMockEvent } from "../src/business/payment.js";
import { createMockVideoProviders } from "../src/modules/generation/video.providers.js";
import { MockJobProvider } from "../src/business/providers.js";
import { MemoryStorage } from "../src/business/storage.js";
import { startWorker } from "../src/business/worker.js";
import { PromptModerationService } from "../src/business/moderation.js";
import { OutputModerationService } from "../src/business/output-moderation.js";
import { PNG_HEADER } from "./helpers.js";
import { generateKeyPairSync } from "node:crypto";

const SECRET = "browser-loop-mock-secret";
const API_PORT = 4000;
const HELPER_PORT = 4902;
const PNG_BYTES = Buffer.from(PNG_HEADER);

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_KEY_PEM = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

const db = await createMemoryDatabase();
await migrate(db);
const storage = new MemoryStorage();

const passModeration = () =>
  new PromptModerationService({
    merchantId: "MER_local",
    privateKey: PRIVATE_KEY_PEM,
    fetcher: async () =>
      new Response(JSON.stringify({ data: { action: "allow", requestId: "REQ_LOOP" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });

const passOutputModeration = () =>
  new OutputModerationService({
    apiKey: "local-loop-key",
    frameExtractor: async () => [PNG_BYTES, PNG_BYTES, PNG_BYTES],
    fetcher: async () =>
      new Response(JSON.stringify({ results: [{ flagged: false, categories: {} }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });

const { app } = await buildApp({
  env: {
    CORS_ALLOWED_ORIGINS: "http://localhost:3100,http://127.0.0.1:3100",
    PAYMENT_MOCK_SECRET: SECRET,
    PAYMENT_PROVIDER: "mock",
    MOCK_CHECKOUT_PUBLIC: "1",
    STUDIO_PUBLIC_ENABLED: "1",
    VIDEO_PUBLIC_ENABLED: "1",
    PURCHASES_PUBLIC_ENABLED: "1",
    // LIVE billing semantics with in-process providers: generation really
    // captures credits, but nothing can leave the machine.
    FAL_LIVE_ENABLED: "1",
    FAL_KEY: "local-loop-no-network",
    LOG_LEVEL: "warn",
  },
  database: db,
  storage,
  paymentSecret: SECRET,
  videoProviders: createMockVideoProviders(),
  outputModeration: passOutputModeration(),
});

const worker = startWorker(
  db,
  {
    provider: new MockJobProvider(),
    videoProviders: createMockVideoProviders(),
    storage,
    generationMode: "live",
    mock: false,
    moderation: passModeration(),
    outputModeration: passOutputModeration(),
  },
  "browser-loop-worker",
  500
);

await app.listen({ port: API_PORT, host: "127.0.0.1" });
console.log(`[loop] API listening on http://127.0.0.1:${API_PORT}`);

const helper = createHttpServer(async (req, res) => {
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === "GET" && req.url === "/state") {
      const orders = await db.query(
        "SELECT id,status,amount_minor,credits FROM payment_orders ORDER BY created_at DESC LIMIT 5"
      );
      const wallets = await db.query(
        "SELECT user_id,balance,reserved,debt FROM credit_wallets ORDER BY updated_at DESC LIMIT 3"
      );
      const jobs = await db.query(
        "SELECT id,status,media_type,credits FROM generation_jobs ORDER BY created_at DESC LIMIT 5"
      );
      return json(200, { orders: orders.rows, wallets: wallets.rows, jobs: jobs.rows });
    }
    if (req.method === "POST" && req.url === "/pay") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const { orderId } = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (typeof orderId !== "string" || orderId.length === 0) {
        return json(400, { error: "orderId required" });
      }
      const payload = JSON.stringify({
        id: `mock-pay-${orderId.slice(0, 8)}`,
        type: "paid",
        orderId,
        paymentId: `mock-payment-${orderId.slice(0, 8)}`,
        amountMinor: 500,
        currency: "USD",
      });
      const response = await fetch(`http://127.0.0.1:${API_PORT}/v1/payments/webhook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mock-signature": signMockEvent(payload, SECRET),
        },
        body: payload,
      });
      return json(response.status, await response.json());
    }
    json(404, { error: "unknown" });
  } catch (error) {
    json(500, { error: error instanceof Error ? error.message : "helper failure" });
  }
});
helper.listen(HELPER_PORT, "127.0.0.1");
console.log(`[loop] PSP helper on http://127.0.0.1:${HELPER_PORT} (/state, /pay)`);

const shutdown = async () => {
  console.log("\n[loop] shutting down…");
  await worker.stop();
  await app.close();
  helper.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
