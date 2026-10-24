import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Database, Sql } from "../db/database.js";
import { AppError } from "../errors/app-error.js";
import { credit, refund } from "./wallet.js";

/**
 * Provider-neutral payment service (R06).
 *
 * Orders are stored without provider specifics beyond opaque provider ids;
 * money is integer minor units + ISO currency. Notifications arrive as raw
 * bodies with a signature — the adapter owns verification (HMAC for the
 * mock; a real PSP plugs in with its own scheme). Every notification is
 * durably recorded in payment_webhook_events BEFORE it can affect money:
 * 'received' rows that crash mid-processing are replayed by retryReceived().
 *
 * The MockPaymentAdapter is development/test-only and must never be enabled
 * in production (see DECISIONS.md — real PSP configuration is an external
 * verification gate).
 */

export interface CheckoutRequest {
  packageId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  orderId: string;
  checkoutUrl: string;
}

export interface PaymentOrderView {
  id: string;
  status: string;
  packageId: string;
  amountMinor: number;
  currency: string;
  credits: number;
  createdAt: string;
}

/** Provider-neutral checkout input handed to an adapter. */
export interface CheckoutAdapterInput {
  /** Internal order id — echoed back by the provider for webhook matching. */
  orderId: string;
  packageId: string;
  buyerEmail: string | null;
  /** Pre-tax amount in minor units. */
  amountMinor: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  /** Provider product mapped to the credit package (required by Waffo). */
  providerProductId: string | null;
}

/**
 * Normalized webhook event. Adapters own signature verification and payload
 * parsing; the service only sees this stable shape, so a provider swap never
 * touches money-handling code.
 */
export interface NormalizedWebhookEvent {
  /** Provider delivery id — the dedup key. */
  id: string;
  kind: "paid" | "refunded" | "ignored";
  /** Internal order id (absent for ignored events). */
  orderId?: string;
  paymentId?: string;
  /** Pre-tax amount in minor units. */
  amountMinor?: number;
  currency?: string;
  /** Original provider payload, stored for audit/replay. */
  raw?: unknown;
}

/** What a payment provider must implement — neutral by design. */
export interface PaymentAdapter {
  readonly provider: string;
  createCheckout(input: CheckoutAdapterInput): Promise<{
    checkoutUrl: string;
    providerCheckoutId: string;
    /** ISO expiry of the hosted session, when the provider reports one. */
    expiresAt?: string;
  }>;
  /**
   * Verifies the signature over the raw bytes and normalizes the event.
   * Throws AppError(FORBIDDEN) when verification fails.
   */
  parseWebhook(raw: string, signature: string): NormalizedWebhookEvent;
  /**
   * Optional pull-based verification for a PENDING order. Used when the
   * browser returns from checkout but the provider webhook has not arrived
   * (or cannot reach a local deployment). Must only report a payment that
   * the provider confirms as completed.
   */
  syncOrder?(input: {
    orderId: string;
    amountMinor: number;
    currency: string;
  }): Promise<NormalizedWebhookEvent | null>;
}

interface OrderRow {
  [key: string]: unknown;
  id: string;
  user_id: string;
  package_id: string;
  amount_minor: number | string;
  currency: string;
  credits: number | string;
  status: string;
}

/** Deterministic HMAC-SHA256 hex signature — the mock provider's scheme. */
export function signMockEvent(raw: string, secret: string): string {
  return createHmac("sha256", secret).update(raw, "utf8").digest("hex");
}

export class MockPaymentAdapter implements PaymentAdapter {
  readonly provider = "mock";
  constructor(private secret: string) {}
  async createCheckout(input: CheckoutAdapterInput): Promise<{
    checkoutUrl: string;
    providerCheckoutId: string;
    expiresAt?: string;
  }> {
    const providerCheckoutId = `mock_${input.orderId}`;
    return {
      providerCheckoutId,
      checkoutUrl: `https://checkout.mock.invalid/${providerCheckoutId}`,
    };
  }
  /** The mock provider has no remote state to poll. */
  async syncOrder(): Promise<NormalizedWebhookEvent | null> {
    return null;
  }

  parseWebhook(raw: string, signature: string): NormalizedWebhookEvent {
    const expected = Buffer.from(signMockEvent(raw, this.secret), "utf8");
    const given = Buffer.from(signature ?? "", "utf8");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new AppError("FORBIDDEN", "Invalid webhook signature");
    }
    return parseMockEvent(raw);
  }
}

/** Parses the mock provider's compact JSON payload into the neutral shape. */
function parseMockEvent(raw: string): NormalizedWebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Webhook body is not valid JSON");
  }
  const event = parsed as {
    id?: unknown;
    type?: unknown;
    orderId?: unknown;
    paymentId?: unknown;
    amountMinor?: unknown;
    currency?: unknown;
  };
  if (
    typeof event.id !== "string" ||
    event.id.length === 0 ||
    typeof event.orderId !== "string" ||
    event.orderId.length === 0 ||
    typeof event.paymentId !== "string" ||
    event.paymentId.length === 0 ||
    (event.type !== "paid" && event.type !== "refunded") ||
    !Number.isInteger(event.amountMinor) ||
    (event.amountMinor as number) <= 0 ||
    typeof event.currency !== "string" ||
    event.currency.length !== 3
  ) {
    throw new AppError("VALIDATION_ERROR", "Webhook payload is malformed");
  }
  return {
    id: event.id,
    kind: event.type,
    orderId: event.orderId,
    paymentId: event.paymentId,
    amountMinor: event.amountMinor as number,
    currency: event.currency,
    raw: parsed,
  };
}

/**
 * Appends our order id to the success URL so the returning browser can ask
 * the API to verify that specific order (webhooks may not reach a local
 * deployment, and they can lag in production too).
 */
function withOrderParam(url: string, orderId: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("order", orderId);
  return parsed.toString();
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Accepts both normalized rows and legacy mock-shaped payloads. */
function normalizeStoredEvent(payload: unknown): NormalizedWebhookEvent {
  const value =
    typeof payload === "string" ? (JSON.parse(payload) as unknown) : payload;
  if (
    value !== null &&
    typeof value === "object" &&
    "kind" in (value as Record<string, unknown>)
  ) {
    return value as NormalizedWebhookEvent;
  }
  return parseMockEvent(JSON.stringify(value));
}

async function applyNormalizedEvent(
  tx: Sql,
  event: NormalizedWebhookEvent
): Promise<boolean> {
  if (!event.orderId || event.amountMinor === undefined || !event.currency) {
    throw new AppError("VALIDATION_ERROR", "Webhook event is incomplete");
  }
  const order = (
    await tx.query<OrderRow>(
      "SELECT id,user_id,package_id,amount_minor,currency,credits,status FROM payment_orders WHERE id=$1 FOR UPDATE",
      [event.orderId]
    )
  ).rows[0];
  if (!order) throw new AppError("NOT_FOUND", "Unknown order in webhook");
  if (
    Number(event.amountMinor) !== Number(order.amount_minor) ||
    event.currency !== order.currency
  ) {
    throw new AppError(
      "CONFLICT",
      "Webhook amount/currency does not match the order"
    );
  }
  if (event.kind === "paid") {
    if (order.status !== "pending") return false; // already settled or superseded
    await tx.query(
      "UPDATE payment_orders SET status='paid',provider_payment_id=$2,updated_at=now() WHERE id=$1 AND provider_payment_id IS NULL",
      [order.id, event.paymentId ?? null]
    );
    await credit(
      tx,
      order.user_id,
      Number(order.credits),
      `order:${order.id}`,
      "purchase"
    );
    return true;
  }
  // refunded
  if (event.kind !== "refunded") return false;
  if (order.status === "refunded") return false;
  if (order.status === "paid") {
    await refund(
      tx,
      order.user_id,
      Number(order.credits),
      `refund:${order.id}`
    );
  }
  // pending → mark refunded without ever granting credits
  await tx.query(
    "UPDATE payment_orders SET status='refunded',provider_payment_id=COALESCE(provider_payment_id,$2),updated_at=now() WHERE id=$1",
    [order.id, event.paymentId ?? null]
  );
  return order.status === "paid";
}

/**
 * Replays every `received` (never processed) webhook row for one provider.
 * Used by the ops CLI so a crash between recording and processing cannot
 * leave a paid order uncredited. Applies the stored normalized event — no
 * provider network call and no re-verification (the signature was checked
 * before the row was written).
 */
export async function retryReceivedEvents(
  db: Database,
  provider: string
): Promise<number> {
  const events = (
    await db.query<{ event_id: string; payload: unknown }>(
      "SELECT event_id,payload FROM payment_webhook_events WHERE provider=$1 AND status='received'",
      [provider]
    )
  ).rows;
  let applied = 0;
  for (const row of events) {
    try {
      const payload = normalizeStoredEvent(row.payload);
      await db.transaction(async (tx) => {
        const result =
          payload.kind === "ignored"
            ? false
            : await applyNormalizedEvent(tx, payload);
        if (result) applied += 1;
        await tx.query(
          "UPDATE payment_webhook_events SET status='processed',processed_at=now(),error=NULL WHERE provider=$1 AND event_id=$2",
          [provider, row.event_id]
        );
      });
    } catch (error) {
      await db.query(
        "UPDATE payment_webhook_events SET status='failed',error=$3 WHERE provider=$1 AND event_id=$2",
        [
          provider,
          row.event_id,
          error instanceof Error ? error.message : "unknown error",
        ]
      );
    }
  }
  return applied;
}

export class PaymentService {
  constructor(
    private db: Database,
    private adapter: PaymentAdapter,
    private allowedOrigins: string[]
  ) {}

  /**
   * Creates (or idempotently returns) a pending order for a package.
   * Redirect URLs must belong to the configured origin allowlist —
   * checkout must never send users (or payment providers) elsewhere.
   */
  async checkout(
    userId: string,
    request: CheckoutRequest,
    idempotencyKey: string
  ): Promise<CheckoutSession> {
    if (
      typeof request?.packageId !== "string" ||
      request.packageId.length === 0 ||
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length === 0
    ) {
      throw new AppError("VALIDATION_ERROR", "packageId and idempotency key are required");
    }
    for (const url of [request.successUrl, request.cancelUrl]) {
      const origin = originOf(url);
      if (typeof url !== "string" || !origin || !this.allowedOrigins.includes(origin)) {
        throw new AppError(
          "VALIDATION_ERROR",
          "successUrl/cancelUrl must use an allowed origin"
        );
      }
    }
    const pkg = (
      await this.db.query<{
        credits: number | string;
        price_minor: number | string;
        currency: string;
        buyer_email: string | null;
        product_id: string | null;
      }>(
        `SELECT p.credits,p.price_minor,p.currency,u.email AS buyer_email,pp.product_id
         FROM credit_packages p
         JOIN users u ON u.id=$2
         LEFT JOIN payment_products pp ON pp.provider=$3 AND pp.package_id=p.id
         WHERE p.id=$1 AND p.active`,
        [request.packageId, userId, this.adapter.provider]
      )
    ).rows[0];
    if (!pkg) throw new AppError("NOT_FOUND", "Credit package not found");
    // A real provider needs an explicit product mapping (created by the
    // provider setup CLI); the mock adapter needs none.
    if (this.adapter.provider !== "mock" && !pkg.product_id) {
      throw new AppError(
        "SERVICE_UNAVAILABLE",
        "Payment is not configured for this package"
      );
    }

    const baseInput = {
      packageId: request.packageId,
      buyerEmail: pkg.buyer_email,
      amountMinor: Number(pkg.price_minor),
      currency: pkg.currency,
      successUrl: request.successUrl,
      cancelUrl: request.cancelUrl,
      providerProductId: pkg.product_id,
    } as const;

    const existing = (
      await this.db.query<{
        id: string;
        status: string;
        provider_checkout_url: string | null;
        provider_checkout_expires_at: Date | string | null;
      }>(
        `SELECT id,status,provider_checkout_url,provider_checkout_expires_at
         FROM payment_orders
         WHERE user_id=$1 AND (idempotency_key=$2 OR (
           package_id=$3 AND provider=$4 AND status='pending'
           AND created_at > now() - interval '1 hour'))
         ORDER BY (idempotency_key=$2) DESC, created_at DESC
         LIMIT 1`,
        [userId, idempotencyKey, request.packageId, this.adapter.provider]
      )
    ).rows[0];

    if (existing) {
      if (existing.status !== 'pending') {
        throw new AppError(
          'CONFLICT',
          `This order is already ${existing.status}`
        );
      }
      // Reuse an unexpired hosted session instead of creating another
      // provider order for the same purchase.
      const expiresAt = existing.provider_checkout_expires_at
        ? new Date(
            existing.provider_checkout_expires_at instanceof Date
              ? existing.provider_checkout_expires_at
              : existing.provider_checkout_expires_at
          ).getTime()
        : 0;
      if (existing.provider_checkout_url && expiresAt > Date.now()) {
        return { orderId: existing.id, checkoutUrl: existing.provider_checkout_url };
      }
      const session = await this.adapter.createCheckout({
        ...baseInput,
        orderId: existing.id,
        successUrl: withOrderParam(request.successUrl, existing.id),
      });
      await this.db.query(
        'UPDATE payment_orders SET provider_checkout_id=$2,provider_checkout_url=$3,provider_checkout_expires_at=$4,updated_at=now() WHERE id=$1',
        [existing.id, session.providerCheckoutId, session.checkoutUrl, session.expiresAt ?? null]
      );
      return { orderId: existing.id, checkoutUrl: session.checkoutUrl };
    }

    const orderId = randomUUID();
    const session = await this.adapter.createCheckout({
      ...baseInput,
      orderId,
      successUrl: withOrderParam(request.successUrl, orderId),
    });
    try {
      await this.db.query(
        'INSERT INTO payment_orders(id,user_id,package_id,provider,provider_checkout_id,provider_checkout_url,provider_checkout_expires_at,amount_minor,currency,credits,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          orderId,
          userId,
          request.packageId,
          this.adapter.provider,
          session.providerCheckoutId,
          session.checkoutUrl,
          session.expiresAt ?? null,
          Number(pkg.price_minor),
          pkg.currency,
          Number(pkg.credits),
          idempotencyKey,
        ]
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === '23505'
      ) {
        const raced = (
          await this.db.query<{
            id: string;
            provider_checkout_url: string | null;
            provider_checkout_expires_at: Date | string | null;
          }>(
            'SELECT id,provider_checkout_url,provider_checkout_expires_at FROM payment_orders WHERE user_id=$1 AND idempotency_key=$2',
            [userId, idempotencyKey]
          )
        ).rows[0];
        if (raced) {
          const racedExpiry = raced.provider_checkout_expires_at
            ? new Date(raced.provider_checkout_expires_at).getTime()
            : 0;
          if (raced.provider_checkout_url && racedExpiry > Date.now()) {
            return { orderId: raced.id, checkoutUrl: raced.provider_checkout_url };
          }
          const again = await this.adapter.createCheckout({
            ...baseInput,
            orderId: raced.id,
            successUrl: withOrderParam(request.successUrl, raced.id),
          });
          await this.db.query(
            'UPDATE payment_orders SET provider_checkout_id=$2,provider_checkout_url=$3,provider_checkout_expires_at=$4,updated_at=now() WHERE id=$1',
            [raced.id, again.providerCheckoutId, again.checkoutUrl, again.expiresAt ?? null]
          );
          return { orderId: raced.id, checkoutUrl: again.checkoutUrl };
        }
      }
      throw error;
    }
    return { orderId, checkoutUrl: session.checkoutUrl };
  }

  /**
   * Verifies, durably records, and applies one provider notification.
   * Duplicate event ids are no-ops once processed; processing itself is
   * idempotent (ledger keys per order/refund), so redeliveries are safe.
   */
  async receive(
    raw: string,
    signature: string
  ): Promise<{ applied: boolean }> {
    if (typeof raw !== "string") {
      throw new AppError("FORBIDDEN", "Invalid webhook signature");
    }
    // Signature verification and payload shape belong to the adapter.
    const event = this.adapter.parseWebhook(raw, signature);
    return this.db.transaction(async (tx) => {
      const inserted = await tx.query(
        "INSERT INTO payment_webhook_events(provider,event_id,payload,status) VALUES($1,$2,$3::jsonb,'received') ON CONFLICT DO NOTHING RETURNING event_id",
        [this.adapter.provider, event.id, JSON.stringify(event)]
      );
      if (inserted.rows.length === 0) {
        const prior = (
          await tx.query<{ status: string }>(
            "SELECT status FROM payment_webhook_events WHERE provider=$1 AND event_id=$2",
            [this.adapter.provider, event.id]
          )
        ).rows[0];
        if (prior?.status === "processed") return { applied: false };
      }
      const applied =
        event.kind === "ignored" ? false : await applyNormalizedEvent(tx, event);
      await tx.query(
        "UPDATE payment_webhook_events SET status='processed',processed_at=now(),error=NULL WHERE provider=$1 AND event_id=$2",
        [this.adapter.provider, event.id]
      );
      return { applied };
    });
  }

  /** Replays notifications that were recorded but never finished applying. */
  async retryReceived(): Promise<number> {
    return retryReceivedEvents(this.db, this.adapter.provider);
  }
  /**
   * Pull-based verification for a pending order. Used when the browser
   * returns from the provider (no inbound webhook required) and as a manual
   * retry path. Applies the same normalized event as a webhook, so crediting
   * stays idempotent.
   */
  async syncOrder(
    userId: string,
    orderId: string
  ): Promise<{ order: PaymentOrderView; applied: boolean }> {
    const row = (
      await this.db.query<OrderRow>(
        "SELECT id,user_id,package_id,amount_minor,currency,credits,status FROM payment_orders WHERE id=$1 AND user_id=$2",
        [orderId, userId]
      )
    ).rows[0];
    if (!row) throw new AppError("NOT_FOUND", "Order not found");
    if (row.status !== "pending" || !this.adapter.syncOrder) {
      return { order: await this.getOrder(userId, orderId), applied: false };
    }
    const event = await this.adapter.syncOrder({
      orderId: row.id,
      amountMinor: Number(row.amount_minor),
      currency: row.currency,
    });
    let applied = false;
    if (event) {
      applied = await this.db.transaction(async (tx) => {
        const inserted = await tx.query(
          "INSERT INTO payment_webhook_events(provider,event_id,payload,status) VALUES($1,$2,$3::jsonb,'received') ON CONFLICT DO NOTHING RETURNING event_id",
          [this.adapter.provider, event.id, JSON.stringify(event)]
        );
        if (inserted.rows.length === 0) return false;
        const result =
          event.kind === "ignored" ? false : await applyNormalizedEvent(tx, event);
        await tx.query(
          "UPDATE payment_webhook_events SET status='processed',processed_at=now(),error=NULL WHERE provider=$1 AND event_id=$2",
          [this.adapter.provider, event.id]
        );
        return result;
      });
    }
    return { order: await this.getOrder(userId, orderId), applied };
  }

  /** Owner-scoped order lookup — one user can never read another's order. */
  async getOrder(userId: string, orderId: string): Promise<PaymentOrderView> {
    const row = (
      await this.db.query<OrderRow & { created_at: Date | string }>(
        "SELECT id,user_id,package_id,amount_minor,currency,credits,status,created_at FROM payment_orders WHERE id=$1 AND user_id=$2",
        [orderId, userId]
      )
    ).rows[0];
    if (!row) throw new AppError("NOT_FOUND", "Order not found");
    return {
      id: row.id,
      status: row.status,
      packageId: row.package_id,
      amountMinor: Number(row.amount_minor),
      currency: row.currency,
      credits: Number(row.credits),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
    };
  }

  async listOrders(userId: string): Promise<PaymentOrderView[]> {
    const rows = (
      await this.db.query<OrderRow & { created_at: Date | string }>(
        "SELECT id,user_id,package_id,amount_minor,currency,credits,status,created_at FROM payment_orders WHERE user_id=$1 ORDER BY created_at DESC",
        [userId]
      )
    ).rows;
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      packageId: row.package_id,
      amountMinor: Number(row.amount_minor),
      currency: row.currency,
      credits: Number(row.credits),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
    }));
  }
}
