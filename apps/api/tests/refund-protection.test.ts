/**
 * Refund / chargeback protection (application level).
 *
 * Proves the payment service's handling of every refund-shape event against
 * an isolated in-memory database, through a scripted adapter that emits
 * already-normalized events (signature handling is adapter-owned and covered
 * in waffo.test.ts):
 *
 *  1. full refund           → auto full revocation (only when provably full)
 *  2. partial refund        → manual_review, NO revocation, event preserved
 *  3. duplicate refund      → second event is a no-op, single revocation
 *  4. refund before payment → order refunded, credits never granted
 *  5. refund after spend    → wallet debt + suspension (cannot profit)
 *  6. chargeback/dispute    → manual_review with the raw payload preserved
 *
 * The manual_review terminal state: rows keep status='manual_review' with a
 * reason, are never replayed by retryReceivedEvents, and never move money.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryDatabase, type Database } from "../src/db/database.js";
import { migrate } from "../src/db/migrate.js";
import { AuthService } from "../src/business/auth.js";
import {
  PaymentService,
  retryReceivedEvents,
  type NormalizedWebhookEvent,
  type PaymentAdapter,
  type CheckoutAdapterInput,
} from "../src/business/payment.js";
import { reserve, capture, getWallet } from "../src/business/wallet.js";
import { enqueueJob } from "../src/business/jobs.js";

/** Scripted adapter: emits the normalized events the tests queue up. */
function scriptedAdapter(queue: NormalizedWebhookEvent[]): PaymentAdapter {
  return {
    provider: "waffo",
    async createCheckout(input: CheckoutAdapterInput) {
      return {
        checkoutUrl: `https://pay.waffo.test/${input.orderId}`,
        providerCheckoutId: `SES_${input.orderId}`,
      };
    },
    async syncOrder() {
      return null;
    },
    parseWebhook(): NormalizedWebhookEvent {
      const next = queue.shift();
      if (!next) throw new Error("no scripted event left");
      return next;
    },
  };
}

type Queue = NormalizedWebhookEvent[];

let db: Database;
let service: PaymentService;
let user: string;
let queue: Queue;

beforeEach(async () => {
  db = await createMemoryDatabase();
  await migrate(db);
  user = (
    await new AuthService(db).signUp("refund@example.test", "example-password-long", "1")
  ).session.user.id;
  queue = [];
  service = new PaymentService(db, scriptedAdapter(queue), ["https://web.example"]);
  await db.query(
    "INSERT INTO credit_packages(id,credits,price_minor,currency,label,active) VALUES('test',100,500,'USD','Test',true)"
  );
  // The scripted adapter reports provider "waffo"; map the package so
  // checkout behaves exactly as it would with a real configured PSP.
  await db.query(
    "INSERT INTO payment_products(provider,package_id,product_id) VALUES('waffo','test','PROD_test')"
  );
});
afterEach(async () => {
  await db?.close();
});

async function order(): Promise<string> {
  const session = await service.checkout(
    user,
    {
      packageId: "test",
      successUrl: "https://web.example/en/credits",
      cancelUrl: "https://web.example/en/credits",
    },
    `key-${Math.random()}`
  );
  return session.orderId;
}

/** Queues a normalized event and pushes it through the real receive() pipeline. */
async function deliver(event: NormalizedWebhookEvent): Promise<{ applied: boolean; needsReview: boolean }> {
  queue.push(event);
  return service.receive(JSON.stringify({}), "ignored-by-scripted-adapter");
}

const paidEvent = (orderId: string): NormalizedWebhookEvent => ({
  id: "pay-1",
  kind: "paid",
  orderId,
  paymentId: "PAY_1",
  amountMinor: 500,
  currency: "USD",
});
const refundEvent = (
  orderId: string,
  eventId: string,
  amountMinor: number,
  opts: { subtotal?: number; total?: number } = {}
): NormalizedWebhookEvent => ({
  id: eventId,
  kind: "refunded",
  orderId,
  paymentId: `PAY_${eventId}`,
  amountMinor,
  originalSubtotalMinor: opts.subtotal,
  originalTotalMinor: opts.total,
  currency: "USD",
});

const wallet = async () => {
  const w = await getWallet(db, user);
  return { credits: w.credits, reserved: w.reserved, debt: w.debt };
};
const orderStatus = async (id: string) =>
  (
    await db.query<{ status: string }>(
      "SELECT status FROM payment_orders WHERE id=$1",
      [id]
    )
  ).rows[0].status;
const eventRow = async (eventId: string) =>
  (
    await db.query<{ status: string; error: string | null; payload: unknown }>(
      "SELECT status,error,payload FROM payment_webhook_events WHERE event_id=$1",
      [eventId]
    )
  ).rows[0];
const refundLedgerCount = async () =>
  (
    await db.query("SELECT count(*)::int AS n FROM credit_ledger WHERE reason='refund'")
  ).rows[0].n;

describe("refund protection", () => {
  it("1. a provably FULL refund auto-revokes the whole order (pre-tax match)", async () => {
    const orderId = await order();
    await deliver(paidEvent(orderId));
    expect(await wallet()).toMatchObject({ credits: 100 });

    const result = await deliver(refundEvent(orderId, "refund-full", 500));
    expect(result).toMatchObject({ applied: true, needsReview: false });
    expect(await orderStatus(orderId)).toBe("refunded");
    expect(await wallet()).toMatchObject({ credits: 0, debt: 0 });
    const ledger = await db.query<{ reason: string }>(
      "SELECT reason FROM credit_ledger WHERE user_id=$1 ORDER BY created_at",
      [user]
    );
    expect(ledger.rows.map((r) => r.reason)).toEqual(["purchase", "refund"]);
  });

  it("1b. a post-tax full refund (original snapshot matches) also auto-revokes", async () => {
    const orderId = await order();
    await deliver(paidEvent(orderId));
    // Waffo reports the refund in charged (post-tax) terms: 545 refunded,
    // original payment snapshot subtotal 500 / total 545 — provably full.
    const result = await deliver(
      refundEvent(orderId, "refund-posttax", 545, { subtotal: 500, total: 545 })
    );
    expect(result).toMatchObject({ applied: true, needsReview: false });
    expect(await orderStatus(orderId)).toBe("refunded");
    expect(await wallet()).toMatchObject({ credits: 0 });
  });

  it("2. a PARTIAL refund is preserved for manual review and revokes NOTHING", async () => {
    const orderId = await order();
    await deliver(paidEvent(orderId));
    expect(await wallet()).toMatchObject({ credits: 100 });

    const result = await deliver(refundEvent(orderId, "refund-partial", 200));
    expect(result).toMatchObject({ applied: false, needsReview: true });
    expect(await orderStatus(orderId)).toBe("paid");
    expect(await wallet()).toMatchObject({ credits: 100, debt: 0 });
    const row = await eventRow("refund-partial");
    expect(row.status).toBe("manual_review");
    expect(row.error).toBe("refund_amount_200_order_500");
    // Raw normalized event preserved verbatim for the human path.
    expect((row.payload as { amountMinor: number }).amountMinor).toBe(200);
    expect(await refundLedgerCount()).toBe(0);
  });

  it("2b. an amount-ambiguous refund (no original snapshot, != order) is never auto-applied", async () => {
    const orderId = await order();
    await deliver(paidEvent(orderId));
    // 545 != 500 and no original snapshot to prove fullness -> human decides.
    const result = await deliver(refundEvent(orderId, "refund-ambiguous", 545));
    expect(result).toMatchObject({ applied: false, needsReview: true });
    expect(await wallet()).toMatchObject({ credits: 100 });
    expect((await eventRow("refund-ambiguous")).status).toBe("manual_review");
  });

  it("3. a duplicate refund event cannot revoke twice", async () => {
    const orderId = await order();
    await deliver(paidEvent(orderId));
    await deliver(refundEvent(orderId, "refund-1", 500));
    expect(await wallet()).toMatchObject({ credits: 0 });

    // Distinct delivery id, same order already refunded -> no-op.
    const result = await deliver(refundEvent(orderId, "refund-2", 500));
    expect(result).toMatchObject({ applied: false });
    expect(await wallet()).toMatchObject({ credits: 0, debt: 0 });
    expect(await refundLedgerCount()).toBe(1);
  });

  it("4. a full refund BEFORE payment marks the order refunded and never grants credits", async () => {
    const orderId = await order();
    const result = await deliver(refundEvent(orderId, "refund-early", 500));
    expect(result).toMatchObject({ applied: false, needsReview: false });
    expect(await orderStatus(orderId)).toBe("refunded");
    expect(await wallet()).toMatchObject({ credits: 0, debt: 0 });
    // The late paid event must not credit a refunded order.
    const late = await deliver({ ...paidEvent(orderId), id: "pay-late", paymentId: "PAY_L" });
    expect(late.applied).toBe(false);
    expect(await wallet()).toMatchObject({ credits: 0 });
  });

  it("5. a refund AFTER credits were spent leaves debt and suspends the user", async () => {
    const orderId = await order();
    await deliver(paidEvent(orderId));
    // Spend 60 credits on a video job (reserve + capture, real semantics).
    const { job } = await enqueueJob(db, {
      userId: user,
      idempotencyKey: "spend-1",
      request: { prompt: "x", device: "phone" },
      inputHash: "hash-1",
      price: 60,
      costMicros: 100,
      mediaType: "video",
    });
    await db.transaction(async (tx) => {
      await reserve(tx, user, job.id, 60);
      await capture(tx, user, job.id);
    });
    expect(await wallet()).toMatchObject({ credits: 40 });

    await deliver(refundEvent(orderId, "refund-spent", 500));
    // Full-order revocation takes the 40 available credits; the 60-credit
    // shortfall becomes debt and the user is suspended (cannot profit).
    expect(await wallet()).toMatchObject({ credits: 0, debt: 60 });
    const u = await db.query<{ status: string }>(
      "SELECT status FROM users WHERE id=$1",
      [user]
    );
    expect(u.rows[0].status).toBe("suspended");
  });

  it("6. a dispute/chargeback event is preserved for manual review, wallet untouched", async () => {
    const orderId = await order();
    await deliver(paidEvent(orderId));
    const result = await deliver({
      id: "cb-1",
      kind: "manual_review",
      reviewReason: "unhandled_event_type:chargeback.opened",
      raw: { eventType: "chargeback.opened", amount: "500" },
    });
    expect(result).toMatchObject({ applied: false, needsReview: true });
    expect(await orderStatus(orderId)).toBe("paid");
    expect(await wallet()).toMatchObject({ credits: 100, debt: 0 });
    const row = await eventRow("cb-1");
    expect(row.status).toBe("manual_review");
    expect(row.error).toBe("unhandled_event_type:chargeback.opened");
    expect((row.payload as { raw: { eventType: string } }).raw.eventType).toBe(
      "chargeback.opened"
    );
  });

  it("manual_review rows are terminal — retryReceivedEvents never replays or applies them", async () => {
    const orderId = await order();
    await deliver(paidEvent(orderId));
    await deliver(refundEvent(orderId, "refund-partial", 200));
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM payment_webhook_events WHERE event_id='refund-partial'"
        )
      ).rows[0].status
    ).toBe("manual_review");
    // Replay only touches 'received' rows — the manual_review row is skipped.
    expect(await retryReceivedEvents(db, "waffo")).toBe(0);
    expect(await wallet()).toMatchObject({ credits: 100 });
  });

  it("mock adapter path still handles full refunds (existing semantics)", async () => {
    const { MockPaymentAdapter, signMockEvent } = await import("../src/business/payment.js");
    const secret = "test-only-payment-signature-secret";
    const mockService = new PaymentService(db, new MockPaymentAdapter(secret), ["https://web.example"]);
    const session = await mockService.checkout(
      user,
      {
        packageId: "test",
        successUrl: "https://web.example/en/credits",
        cancelUrl: "https://web.example/en/credits",
      },
      "mock-key-1"
    );
    const raw = JSON.stringify({
      id: "mock-refund-1",
      type: "refunded",
      orderId: session.orderId,
      paymentId: "mock-pay-1",
      amountMinor: 500,
      currency: "USD",
    });
    const result = await mockService.receive(raw, signMockEvent(raw, secret));
    expect(result.applied).toBe(false); // order was pending — marked refunded, nothing granted
    expect(await orderStatus(session.orderId)).toBe("refunded");
  });
});
