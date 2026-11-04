import {
  WaffoPancake,
  verifyWebhook,
  type WebhookEvent,
} from "@waffo/pancake-ts";
import { AppError } from "../errors/app-error.js";
import type {
  CheckoutAdapterInput,
  NormalizedWebhookEvent,
  PaymentAdapter,
} from "./payment.js";

/**
 * Waffo Pancake adapter (R06/PSP integration).
 *
 * - Checkout sessions reference our internal order through
 *   `orderMerchantExternalId`, which the provider echoes back on order and
 *   refund events; `metadata.orderId` is a second correlation channel.
 * - Webhooks are verified with the SDK's RSA-SHA256 verifier over the RAW
 *   body (the API captures `request.rawBody`), and the event `mode` must
 *   match the configured environment — a test event can never settle a
 *   production order.
 * - Amounts are display strings in the provider payload; they are converted
 *   to minor units using the currency exponent. The PRE-TAX subtotal is
 *   compared with the order, because tax is added by the provider.
 */

const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG",
  "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF",
]);
const THREE_DECIMAL = new Set([
  "BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND",
]);

function minorExponent(currency: string): number {
  if (ZERO_DECIMAL.has(currency)) return 0;
  if (THREE_DECIMAL.has(currency)) return 3;
  return 2;
}

/** Converts a provider display amount ("29.00", "1000") to minor units. */
export function toMinorUnits(display: string, currency: string): number {
  const value = display.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new AppError("VALIDATION_ERROR", "Unsupported amount format");
  }
  const [whole, fraction = ""] = value.split(".");
  const exponent = minorExponent(currency.toUpperCase());
  if (fraction.length > exponent) {
    if (/[1-9]/.test(fraction.slice(exponent))) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Amount has more precision than the currency allows"
      );
    }
  }
  const padded = (fraction + "0".repeat(exponent)).slice(0, exponent);
  return Number(whole) * 10 ** exponent + Number(padded || "0");
}

/** Pre-tax amount for a payment event, falling back to the charged total. */
function paidMinor(event: WebhookEvent, currency: string): number {
  const data = event.data;
  const display =
    data.listPrice?.subtotal ??
    data.listPrice?.total ??
    data.chargedAmount ??
    data.amount;
  if (typeof display !== "string") {
    throw new AppError("VALIDATION_ERROR", "Payment event has no amount");
  }
  return toMinorUnits(display, currency);
}

/**
 * Refund figures for a refund event, per the SDK contract (NOT guessed):
 * - `refundedAmount` is the amount actually refunded BY THIS EVENT (falls
 *   back to the deprecated event-level `amount` when the channel reported
 *   none) — the event's own figure;
 * - `originalPayment.subtotal`/`total` (and the charged figure) describe the
 *   payment being refunded, so the application can PROVE a full refund
 *   before revoking credits. Absent snapshots stay absent — never zero-filled.
 */
function refundMinors(
  event: WebhookEvent,
  currency: string
): {
  refundMinor: number;
  originalSubtotalMinor?: number;
  originalTotalMinor?: number;
} {
  const data = event.data;
  const refundDisplay = data.refundedAmount ?? data.amount;
  if (typeof refundDisplay !== "string") {
    throw new AppError("VALIDATION_ERROR", "Refund event has no refunded amount");
  }
  const refundMinor = toMinorUnits(refundDisplay, currency);
  const originalSubtotal =
    data.originalPayment?.subtotal ?? data.originalPayment?.total;
  const originalTotal = data.originalPayment?.total ?? data.originalChargedAmount;
  return {
    refundMinor,
    originalSubtotalMinor:
      typeof originalSubtotal === "string"
        ? toMinorUnits(originalSubtotal, currency)
        : undefined,
    originalTotalMinor:
      typeof originalTotal === "string"
        ? toMinorUnits(originalTotal, currency)
        : undefined,
  };
}

/**
 * Waffo's merchant GraphQL rejects ID! variables (unknown type); use String!
 * for all id variables.
 */
function withTimeout<T>(run: Promise<T>, ms = 12_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    run,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new AppError("SERVICE_UNAVAILABLE", "Payment provider timed out")),
        ms
      );
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

export class WaffoPaymentAdapter implements PaymentAdapter {
  readonly provider = "waffo";

  constructor(
    private client: WaffoPancake,
    private environment: "test" | "prod"
  ) {}

  async createCheckout(input: CheckoutAdapterInput): Promise<{
    checkoutUrl: string;
    providerCheckoutId: string;
    expiresAt?: string;
  }> {
    if (!input.providerProductId) {
      throw new AppError(
        "SERVICE_UNAVAILABLE",
        "Payment product is not configured for this package"
      );
    }
    const session = await withTimeout(
      this.client.checkout.createSession(
      {
        productId: input.providerProductId,
        currency: input.currency,
        ...(input.buyerEmail ? { buyerEmail: input.buyerEmail } : {}),
        successUrl: input.successUrl,
        orderMerchantExternalId: input.orderId.slice(0, 128),
        metadata: { orderId: input.orderId, packageId: input.packageId },
        expiresInSeconds: 3600,
      },
      // The order id is the natural idempotency key: a retried checkout for
      // the same order returns the same session instead of creating another.
      { idempotencyKey: `checkout_${input.orderId}` }
    ));
    return {
      checkoutUrl: session.checkoutUrl,
      providerCheckoutId: session.sessionId,
      expiresAt: session.expiresAt,
    };
  }

  parseWebhook(raw: string, signature: string): NormalizedWebhookEvent {
    let event: WebhookEvent;
    try {
      event = verifyWebhook(raw, signature, {
        environment: this.environment,
      });
    } catch {
      throw new AppError("FORBIDDEN", "Invalid webhook signature");
    }
    if (event.mode !== this.environment) {
      throw new AppError(
        "FORBIDDEN",
        "Webhook environment does not match this deployment"
      );
    }

    if (event.eventType === "order.completed") {
      const orderId = this.internalOrderId(event);
      return {
        id: event.id,
        kind: "paid",
        orderId,
        paymentId: event.data.paymentId ?? event.data.orderId,
        amountMinor: paidMinor(event, event.data.currency),
        currency: event.data.currency,
        raw: event,
      };
    }

    if (event.eventType === "refund.succeeded") {
      const orderId = this.internalOrderId(event);
      const minors = refundMinors(event, event.data.currency);
      return {
        id: event.id,
        kind: "refunded",
        orderId,
        paymentId:
          event.data.paymentId ??
          event.data.refundTicketMerchantExternalId ??
          event.data.orderId,
        amountMinor: minors.refundMinor,
        originalSubtotalMinor: minors.originalSubtotalMinor,
        originalTotalMinor: minors.originalTotalMinor,
        currency: event.data.currency,
        raw: event,
      };
    }

    if (event.eventType === "refund.failed") {
      // Known and final: the refund attempt failed, so no money moved and
      // nothing is owed. Recorded (payload below) and acknowledged.
      return { id: event.id, kind: "ignored", raw: event };
    }

    // Everything else — subscriptions (this store sells one-time credit
    // packages only) and ANY unrecognized type (e.g. a future dispute/
    // chargeback event) — is preserved verbatim and flagged for a human.
    // Meanings are never guessed and no money path runs automatically.
    return {
      id: event.id,
      kind: "manual_review",
      reviewReason: `unhandled_event_type:${event.eventType}`,
      raw: event,
    };
  }

  /**
   * Pull-based verification for a pending order: asks the merchant API
   * whether this order has a succeeded payment and is completed. Used on
   * return from the cashier, where a local deployment cannot receive the
   * webhook. Only a provider-confirmed completed order is reported.
   */
  async syncOrder(input: {
    orderId: string;
    amountMinor: number;
    currency: string;
  }): Promise<NormalizedWebhookEvent | null> {
    const payments = await withTimeout(this.client.graphql.query<{
      payments: Array<{ id: string; orderId: string; status: string }>;
    }>({
      query: `query ($ref: String!) {
        payments(filter: { orderMerchantExternalId: { eq: $ref } }) {
          id orderId status
        }
      }`,
      variables: { ref: input.orderId },
    }));
    if (payments.errors?.length) {
      throw new AppError('UPSTREAM_ERROR', 'Payment provider lookup failed');
    }
    const succeeded = (payments.data?.payments ?? []).find(
      (payment) => payment.status === 'succeeded'
    );
    if (!succeeded) return null;

    const detailResult = await withTimeout(this.client.graphql.query<{
      onetimeOrder: {
        id: string;
        status: string;
        currency: string;
        priceSnapshot?: { currency: string; subtotal?: string; total: string };
      } | null;
    }>({
      query: `query ($id: String!) {
        onetimeOrder(id: $id) {
          id status currency
          priceSnapshot { currency subtotal total }
        }
      }`,
      variables: { id: succeeded.orderId },
    }));
    if (detailResult.errors?.length) {
      throw new AppError('UPSTREAM_ERROR', 'Payment provider lookup failed');
    }
    const detail = detailResult.data?.onetimeOrder;
    if (!detail || detail.status !== 'completed') return null;
    const currency = detail.priceSnapshot?.currency ?? detail.currency ?? input.currency;
    const display = detail.priceSnapshot?.subtotal ?? detail.priceSnapshot?.total;
    if (typeof display !== 'string') {
      throw new AppError('UPSTREAM_ERROR', 'Provider order has no amount snapshot');
    }
    return {
      id: `sync:${succeeded.id}`,
      kind: 'paid',
      orderId: input.orderId,
      paymentId: succeeded.id,
      amountMinor: toMinorUnits(display, currency),
      currency,
    };
  }

  private internalOrderId(event: WebhookEvent): string {
    const orderId =
      event.data.orderMerchantExternalId ??
      event.data.orderMetadata?.orderId;
    if (typeof orderId !== "string" || orderId.length === 0) {
      throw new AppError(
        "CONFLICT",
        "Webhook is missing the internal order reference"
      );
    }
    return orderId;
  }
}
