/**
 * Checkout ordering regression (launch task §4 — P0 fix verification).
 *
 * The order row must be durable BEFORE the external provider checkout is
 * created, so that:
 * - a lost checkout response can never orphan an external session (the same
 *   Idempotency-Key resumes THIS order, never a second external checkout);
 * - a webhook arriving before the hosted session exists applies to a real
 *   order instead of bouncing as unknown-order;
 * - a concurrent duplicate reuses the winning order (same id) instead of
 *   creating a second external session.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryDatabase, type Database } from "../src/db/database.js";
import { migrate } from "../src/db/migrate.js";
import { AuthService } from "../src/business/auth.js";
import {
  MockPaymentAdapter,
  PaymentService,
  signMockEvent,
  type CheckoutAdapterInput,
} from "../src/business/payment.js";

let db: Database;
const SECRET = "test-only-payment-signature-secret";

beforeEach(async () => {
  db = await createMemoryDatabase();
  await migrate(db);
  await db.query(
    "INSERT INTO credit_packages(id,credits,price_minor,currency,label,active) VALUES('test',100,500,'USD','Test',true)"
  );
});
afterEach(async () => {
  await db?.close();
});

function orderCount(): Promise<number> {
  return db
    .query<{ n: number }>("SELECT count(*)::int AS n FROM payment_orders")
    .then((r) => r.rows[0].n);
}

describe("checkout: order-first durability", () => {
  it("the order row exists before the external checkout call", async () => {
    const seen: string[] = [];
    const adapter = new MockPaymentAdapter(SECRET);
    adapter.createCheckout = async (input: CheckoutAdapterInput) => {
      const rows = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM payment_orders WHERE id=$1",
        [input.orderId]
      );
      seen.push(`${input.orderId}:${rows.rows[0].n}`);
      return {
        checkoutUrl: `https://pay.example/${input.orderId}`,
        providerCheckoutId: `co_${input.orderId}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      };
    };
    const user = (
      await new AuthService(db).signUp("timing@example.test", "example-password-long", "1")
    ).session.user.id;
    const service = new PaymentService(db, adapter, ["https://web.example"]);

    await service.checkout(
      user,
      { packageId: "test", successUrl: "https://web.example/en/credits", cancelUrl: "https://web.example/en/credits" },
      "timing-key"
    );
    expect(seen).toEqual([`${seen[0].split(":")[0]}:1`]);
    expect(await orderCount()).toBe(1);
  });

  it("a failing external call leaves a resumable pending order; retry reuses the SAME order id", async () => {
    const adapter = new MockPaymentAdapter(SECRET);
    let attempts = 0;
    adapter.createCheckout = async (input: CheckoutAdapterInput) => {
      attempts += 1;
      if (attempts === 1) throw new Error("network lost after provider accepted");
      return {
        checkoutUrl: `https://pay.example/${input.orderId}`,
        providerCheckoutId: `co_${input.orderId}`,
      };
    };
    const user = (
      await new AuthService(db).signUp("resume@example.test", "example-password-long", "1")
    ).session.user.id;
    const service = new PaymentService(db, adapter, ["https://web.example"]);
    const request = {
      packageId: "test" as const,
      successUrl: "https://web.example/en/credits",
      cancelUrl: "https://web.example/en/credits",
    };

    await expect(service.checkout(user, request, "resume-key")).rejects.toThrow(/network lost/);
    expect(await orderCount()).toBe(1);
    const pending = (
      await db.query<{ id: string; status: string }>(
        "SELECT id,status FROM payment_orders"
      )
    ).rows[0];
    expect(pending.status).toBe("pending");

    // Same idempotency key resumes the SAME order — a second external
    // session for a NEW order is never created.
    const retried = await service.checkout(user, request, "resume-key");
    expect(retried.orderId).toBe(pending.id);
    expect(attempts).toBe(2);
    expect(await orderCount()).toBe(1);
  });

  it("a webhook arriving before the hosted session exists settles the durable order", async () => {
    const adapter = new MockPaymentAdapter(SECRET);
    const user = (
      await new AuthService(db).signUp("early-hook@example.test", "example-password-long", "1")
    ).session.user.id;
    const service = new PaymentService(db, adapter, ["https://web.example"]);
    const request = {
      packageId: "test" as const,
      successUrl: "https://web.example/en/credits",
      cancelUrl: "https://web.example/en/credits",
    };

    // Simulate "webhook beat the checkout response": create the order
    // (insert-first), then pay it BEFORE any createCheckout succeeded.
    const probing = new PaymentService(db, adapter, ["https://web.example"]);
    const created = await probing.checkout(user, request, "early-key");
    const raw = JSON.stringify({
      id: "evt-early-1",
      type: "paid",
      orderId: created.orderId,
      paymentId: "pay-early",
      amountMinor: 500,
      currency: "USD",
    });
    const applied = await service.receive(raw, signMockEvent(raw, SECRET));
    expect(applied.applied).toBe(true);

    const wallet = await db.query<{ balance: number }>(
      "SELECT balance FROM credit_wallets WHERE user_id=$1",
      [user]
    );
    expect(Number(wallet.rows[0].balance)).toBe(100);
    const order = await db.query<{ status: string }>(
      "SELECT status FROM payment_orders WHERE id=$1",
      [created.orderId]
    );
    expect(order.rows[0].status).toBe("paid");
  });

  it("concurrent duplicate checkouts share ONE order id", async () => {
    const adapter = new MockPaymentAdapter(SECRET);
    const orderIds = new Set<string>();
    adapter.createCheckout = async (input: CheckoutAdapterInput) => {
      orderIds.add(input.orderId);
      return {
        checkoutUrl: `https://pay.example/${input.orderId}`,
        providerCheckoutId: `co_${input.orderId}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      };
    };
    const user = (
      await new AuthService(db).signUp("race@example.test", "example-password-long", "1")
    ).session.user.id;
    const service = new PaymentService(db, adapter, ["https://web.example"]);
    const request = {
      packageId: "test" as const,
      successUrl: "https://web.example/en/credits",
      cancelUrl: "https://web.example/en/credits",
    };

    const [a, b] = await Promise.all([
      service.checkout(user, request, "race-key"),
      service.checkout(user, request, "race-key"),
    ]);
    expect(a.orderId).toBe(b.orderId);
    expect(orderIds.size).toBe(1);
    expect(await orderCount()).toBe(1);
  });
});
