/**
 * Waffo production-switch safety combination (task: Waffo prod config check).
 *
 * Proves the exact operator combination —
 *   PAYMENT_PROVIDER=waffo + PAYMENT_ENVIRONMENT=prod +
 *   PURCHASES_PUBLIC_ENABLED=0 + PURCHASES_PAUSED=1 —
 * in a fully isolated environment (in-memory DB, local RSA webhook key, no
 * network: the adapter is constructed but never talked to except through
 * our signed webhook payloads):
 *
 *  1. NEW checkout is refused (503) even though the provider is waffo;
 *  2. the pricing endpoint reports checkoutAvailable=true (waffo) but
 *     purchasesPublic=false / purchasesPaused=true → the web resolver keeps
 *     buy buttons CLOSED (no auto-open);
 *  3. a VALID prod-mode Waffo webhook (order.completed) is accepted and
 *     credits land — closed purchase ≠ deaf webhook;
 *  4. a full refund still processes automatically; a partial refund lands in
 *     the manual_review queue without touching money;
 *  5. historical received-but-unprocessed events replay via the ops path;
 *  6. tampered signatures / wrong-environment events are rejected.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign as rsaSign } from "node:crypto";
import { buildApp } from "../src/app.js";
import { createMemoryDatabase, type Database } from "../src/db/database.js";
import { migrate } from "../src/db/migrate.js";
import type { FastifyInstance } from "fastify";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PUBLIC_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
// The same key doubles as the merchant private key so the SDK client can
// be constructed offline; it never moves real money in this test.
const PRIVATE_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

/** X-Waffo-Signature header per the SDK contract: t=<ms>,v1=<base64 sig>. */
function waffoHeader(payload: string, stamp = Date.now()): string {
  const signature = rsaSign("RSA-SHA256", Buffer.from(`${stamp}.${payload}`), privateKey).toString("base64");
  return `t=${stamp},v1=${signature}`;
}

/** A prod-mode Waffo order.completed event with pre-tax subtotal $5.00. */
function paidEvent(orderId: string, id = "dlv-prod-1"): string {
  return JSON.stringify({
    id,
    timestamp: new Date().toISOString(),
    eventType: "order.completed",
    eventId: `PAY_${id}`,
    storeId: "STO_prod",
    storeName: "WallHaze",
    mode: "prod",
    data: {
      orderId: "waffo-order-1",
      buyerEmail: "buyer@example.test",
      currency: "USD",
      amount: "5.00",
      taxAmount: "0.45",
      orderMerchantExternalId: orderId,
      listPrice: { total: "5.45", subtotal: "5.00", taxAmount: "0.45" },
      chargedAmount: "5.45",
      paymentId: `PAY_${id}`,
    },
  });
}

let db: Database;
let app: FastifyInstance;
let cleanup: (() => Promise<void>) | undefined;
let cookie: string;

const WEB = {
  "x-wallhaze-client": "web",
  "content-type": "application/json",
  origin: "https://web.example",
};

beforeEach(async () => {
  process.env.WAFFO_WEBHOOK_PROD_PUBLIC_KEY = PUBLIC_PEM;
  db = await createMemoryDatabase();
  await migrate(db);
  const built = await buildApp({
    env: {
      CORS_ALLOWED_ORIGINS: "https://web.example",
      // The exact operator combination under test:
      PAYMENT_PROVIDER: "waffo",
      PAYMENT_ENVIRONMENT: "prod",
      PURCHASES_PAUSED: "1",
      // PURCHASES_PUBLIC_ENABLED intentionally ABSENT (=0).
      WAFFO_MERCHANT_ID: "MER_prodTest00000000000000",
      WAFFO_STORE_ID: "STO_prod",
      WAFFO_PRIVATE_KEY: PRIVATE_PEM,
    },
    database: db,
    paymentSecret: "unused-for-waffo",
  });
  app = built.app;
  cleanup = () => app.close();

  const signup = await app.inject({
    method: "POST",
    url: "/v1/auth/signup",
    headers: WEB,
    payload: { email: "prod-switch@example.test", password: "example-password-long" },
  });
  cookie = signup.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
});

afterEach(async () => {
  delete process.env.WAFFO_WEBHOOK_PROD_PUBLIC_KEY;
  await cleanup?.();
  await db?.close();
});

const wallet = () => db.query("SELECT balance,reserved FROM credit_wallets").then((r) => r.rows[0]);

describe("waffo prod + closed purchases combination", () => {
  it("refuses NEW checkout while purchases are paused", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/checkout",
      headers: { ...WEB, cookie, "idempotency-key": "blocked-1" },
      payload: {
        packageId: "starter",
        successUrl: "https://web.example/zh/credits",
        cancelUrl: "https://web.example/zh/credits",
      },
    });
    expect(res.statusCode).toBe(503);
    expect((await db.query("SELECT count(*)::int AS n FROM payment_orders")).rows[0].n).toBe(0);
  });

  it("reports waffo checkoutAvailable but purchases closed — web keeps buttons shut", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/credits/pricing" });
    const body = res.json();
    expect(body).toMatchObject({
      paymentProvider: "waffo",
      checkoutAvailable: true,
      purchasesPublic: false,
      purchasesPaused: true,
    });
    // Web-side resolveCommercialGates() maps purchasesPublic=false to
    // purchasesOpen=false → disabled button (covered by the web suite).
  });

  it("accepts a VALID prod-mode order.completed webhook and lands credits", async () => {
    const order = (
      await db.query(
        "INSERT INTO payment_orders(id,user_id,package_id,provider,idempotency_key,amount_minor,currency,credits,status) VALUES('ord-1',(SELECT id FROM users LIMIT 1),'starter','waffo','ik-1',500,'USD',100,'pending') RETURNING id"
      )
    ).rows[0];
    void order;
    const payload = paidEvent("ord-1");
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook",
      headers: { ...WEB, "x-waffo-signature": waffoHeader(payload) },
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ received: true, applied: true, needsReview: false });
    expect(await wallet()).toMatchObject({ balance: 100 });
    expect(
      (await db.query("SELECT status FROM payment_orders WHERE id='ord-1'")).rows[0].status
    ).toBe("paid");
  });

  it("rejects tampered payloads and wrong-environment events", async () => {
    const payload = paidEvent("ord-x", "dlv-bad");
    const goodHeader = waffoHeader(payload);
    const tampered = payload.replace("5.00", "1.00");
    const tamperedRes = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook",
      headers: { ...WEB, "x-waffo-signature": goodHeader },
      payload: tampered,
    });
    expect(tamperedRes.statusCode).toBe(403);

    const testMode = paidEvent("ord-y", "dlv-test").replace('"mode":"prod"', '"mode":"test"');
    const testRes = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook",
      headers: { ...WEB, "x-waffo-signature": waffoHeader(testMode) },
      payload: testMode,
    });
    expect(testRes.statusCode).toBe(403);
  });

  it("processes a historical full refund automatically and parks a partial refund for review", async () => {
    // Seed a paid order + 100 credits, as if the payment happened earlier.
    await db.query(
      "INSERT INTO payment_orders(id,user_id,package_id,provider,idempotency_key,provider_payment_id,amount_minor,currency,credits,status) VALUES('ord-h',(SELECT id FROM users LIMIT 1),'starter','waffo','ik-h','PAY_h',500,'USD',100,'paid') RETURNING id"
    );
    await db.transaction(async (tx) => {
      const { credit } = await import("../src/business/wallet.js");
      const user = (
        await tx.query<{ id: string }>("SELECT id FROM users LIMIT 1")
      ).rows[0].id;
      await credit(tx, user, 100, "order:ord-h", "purchase");
    });

    const refundPayload = JSON.stringify({
      id: "dlv-refund-1",
      timestamp: new Date().toISOString(),
      eventType: "refund.succeeded",
      eventId: "REF_1",
      storeId: "STO_prod",
      mode: "prod",
      data: {
        orderId: "waffo-order-h",
        orderMerchantExternalId: "ord-h",
        buyerEmail: "buyer@example.test",
        currency: "USD",
        amount: "5.45",
        refundedAmount: "5.45",
        originalPayment: { total: "5.45", subtotal: "5.00", taxAmount: "0.45" },
        paymentId: "PAY_h",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook",
      headers: { ...WEB, "x-waffo-signature": waffoHeader(refundPayload) },
      payload: refundPayload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().applied).toBe(true);
    expect(await wallet()).toMatchObject({ balance: 0 });
    expect(
      (await db.query("SELECT status FROM payment_orders WHERE id='ord-h'")).rows[0].status
    ).toBe("refunded");

    // A PARTIAL refund is preserved for a human — never auto-revoked.
    await db.query(
      "INSERT INTO payment_orders(id,user_id,package_id,provider,idempotency_key,provider_payment_id,amount_minor,currency,credits,status) VALUES('ord-p',(SELECT id FROM users LIMIT 1),'starter','waffo','ik-p','PAY_p',500,'USD',100,'paid')"
    );
    const partial = refundPayload
      .replace("dlv-refund-1", "dlv-refund-2")
      .replace("REF_1", "REF_2")
      .replace("ord-h", "ord-p")
      .replace("PAY_h", "PAY_p")
      .replace('"refundedAmount":"5.45"', '"refundedAmount":"2.00"')
      .replace('"amount":"5.45"', '"amount":"2.45"');
    const partialRes = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook",
      headers: { ...WEB, "x-waffo-signature": waffoHeader(partial) },
      payload: partial,
    });
    expect(partialRes.json()).toMatchObject({ received: true, applied: false, needsReview: true });
    expect(await wallet()).toMatchObject({ balance: 0 }); // unchanged by the partial event
    const row = (
      await db.query("SELECT status,error FROM payment_webhook_events WHERE event_id='dlv-refund-2'")
    ).rows[0];
    expect(row.status).toBe("manual_review");
    expect(row.error).toContain("refund_amount_200_order_500");
  });

  it("replays historical received-but-unprocessed events through the ops path", async () => {
    await db.query(
      "INSERT INTO payment_orders(id,user_id,package_id,provider,idempotency_key,amount_minor,currency,credits,status) VALUES('ord-r',(SELECT id FROM users LIMIT 1),'starter','waffo','ik-r',500,'USD',100,'pending')"
    );
    // A normalized event recorded before a crash, never processed.
    await db.query(
      `INSERT INTO payment_webhook_events(provider,event_id,payload,status)
       VALUES('waffo','dlv-crash',$1,'received')`,
      [
        JSON.stringify({
          id: "dlv-crash",
          kind: "paid",
          orderId: "ord-r",
          paymentId: "PAY_crash",
          amountMinor: 500,
          currency: "USD",
        }),
      ]
    );
    const { retryReceivedEvents } = await import("../src/business/payment.js");
    expect(await retryReceivedEvents(db, "waffo")).toBe(1);
    expect(
      (await db.query("SELECT status FROM payment_orders WHERE id='ord-r'")).rows[0].status
    ).toBe("paid");
    expect(await wallet()).toMatchObject({ balance: 100 });
  });
});
