/** Credentialed backend adapter. Missing API configuration returns unavailable. */

import { apiRequest, resolveApiBaseUrl, type ApiResult } from "./client";
import type { VideoPricing } from "@wallhaze/contracts";

/** Proposed wallet snapshot (not yet a backend contract). */
export interface WalletBalance {
  credits: number;
  /** Credits currently held for running jobs (spendable = credits - reserved). */
  reserved?: number;
  updatedAt: string | null;
}

/** Proposed purchasable package. Prices come only from the backend. */
export interface CreditPackage {
  id: string;
  credits: number;
  /** Minor units (e.g. cents) + ISO currency code — no float money. */
  priceMinorUnits: number;
  currency: string;
  label: string | null;
}

/** Proposed credit ledger entry (purchases and generation spending). */
export interface CreditTransaction {
  id: string;
  createdAt: string;
  /** Positive for top-ups, negative for spending. */
  delta: number;
  /** Reservation-only change (balance unchanged); internal accounting. */
  reservedDelta?: number;
  reason: string | null;
}

/** Provider-agnostic order shape — no payment-provider fields leak here. */
export interface PaymentOrder {
  id: string;
  createdAt: string;
  status: "pending" | "paid" | "failed" | "refunded" | null;
  packageId: string | null;
  amountMinorUnits: number | null;
  currency: string | null;
}

/** Server pricing + payment availability (backend contract). */
export interface CreditsPricing {
  creditsPerGeneration: number;
  costBoundMicros: number;
  paymentProvider: string;
  /** True only when a real, redirectable checkout provider is configured. */
  checkoutAvailable: boolean;
  /** Runtime generation mode: mock / live / disabled (fail-closed). */
  generationMode?: "mock" | "live" | "disabled";
  /** Operator pause: submissions are refused by the backend. */
  paused?: boolean;
  /**
   * Commercial gates (fail-closed): a missing field or a failed probe means
   * "closed" — the UI never invents an open state the backend did not prove.
   */
  /** Checkout channel is open to the public. */
  purchasesPublic?: boolean;
  /** Operator pause on the checkout channel (channel exists, sales paused). */
  purchasesPaused?: boolean;
  /** AI Studio (image generation) is open to the public. */
  studioPublic?: boolean;
  /** Video generation is open (backend composes studioPublic && video flag). */
  videoPublic?: boolean;
  /** Video capability + pricing matrix from the backend. */
  video?: VideoPricing;
}

/** Fail-closed commercial gates derived from a pricing probe. */
export interface CommercialGates {
  /** Checkout is purchasable right now (public AND not paused). */
  purchasesOpen: boolean;
  /** Operator paused the checkout channel. */
  purchasesPaused: boolean;
  /** AI Studio generation is open to the public. */
  studioOpen: boolean;
  /** Video generation is open (backend already composes studio && video). */
  videoOpen: boolean;
}

const COMMERCIAL_GATES_CLOSED: CommercialGates = {
  purchasesOpen: false,
  purchasesPaused: false,
  studioOpen: false,
  videoOpen: false,
};

/**
 * Derives the commercial gates from a pricing probe. Any failure (no API
 * base URL, network error, non-2xx) yields the all-closed state — callers
 * never branch on probe success themselves.
 */
export function resolveCommercialGates(
  result: ApiResult<CreditsPricing> | null,
): CommercialGates {
  if (!result || !result.ok) return COMMERCIAL_GATES_CLOSED;
  return {
    purchasesOpen:
      result.data.purchasesPublic === true &&
      result.data.purchasesPaused !== true,
    purchasesPaused: result.data.purchasesPaused === true,
    studioOpen: result.data.studioPublic === true,
    videoOpen: result.data.videoPublic === true,
  };
}

/** Proposed checkout initiation request. */
export interface CheckoutRequest {
  packageId: string;
  successUrl: string;
  cancelUrl: string;
}

/** Proposed checkout session — the provider-agnostic redirect target. */
export interface CheckoutSession {
  orderId: string;
  checkoutUrl: string;
}

/**
 * Service gate. Flipping this is part of the future wallet/payment
 * integration — never from UI code.
 */
export const CREDIT_WALLET_SERVICES_CONFIGURED = Boolean(resolveApiBaseUrl());


export interface CreditsAdapter {
  getWallet(): Promise<ApiResult<WalletBalance>>;
  listCreditPackages(): Promise<ApiResult<CreditPackage[]>>;
  listCreditTransactions(): Promise<ApiResult<CreditTransaction[]>>;
  /** Price + whether checkout can actually be offered. */
  getPricing(): Promise<ApiResult<CreditsPricing>>;
  /** Reserved: checkout stays structurally blocked while gated. */
  createCheckout(request: CheckoutRequest, idempotencyKey?: string): Promise<ApiResult<CheckoutSession>>;
  listPaymentOrders(): Promise<ApiResult<PaymentOrder[]>>;
  /** Verifies a pending order directly with the provider (webhook fallback). */
  syncOrder(orderId: string): Promise<ApiResult<{ order: PaymentOrder; applied: boolean }>>;
}

class GatedCreditsAdapter implements CreditsAdapter {
  async getWallet(): Promise<ApiResult<WalletBalance>> {
    return apiRequest("/v1/credits/wallet");
  }

  async listCreditPackages(): Promise<ApiResult<CreditPackage[]>> {
    return apiRequest("/v1/credits/packages");
  }

  async listCreditTransactions(): Promise<ApiResult<CreditTransaction[]>> {
    return apiRequest("/v1/credits/transactions");
  }

  async getPricing(): Promise<ApiResult<CreditsPricing>> {
    return apiRequest("/v1/credits/pricing");
  }

  async createCheckout(
    _request: CheckoutRequest, idempotencyKey = crypto.randomUUID()
  ): Promise<ApiResult<CheckoutSession>> {
    return apiRequest("/v1/payments/checkout", { method: "POST", body: _request, headers: { "Idempotency-Key": idempotencyKey } });
  }

  async listPaymentOrders(): Promise<ApiResult<PaymentOrder[]>> {
    return (async () => { const r = await apiRequest<{ items: PaymentOrder[] }>("/v1/orders"); return r.ok ? { ok: true, data: r.data.items } : r; })();
  }

  async syncOrder(orderId: string): Promise<ApiResult<{ order: PaymentOrder; applied: boolean }>> {
    return apiRequest(`/v1/payments/orders/${encodeURIComponent(orderId)}/sync`, { method: "POST", body: {} });
  }
}

/** App-wide singleton. Tests may construct their own GatedCreditsAdapter. */
export const creditsAdapter: CreditsAdapter = new GatedCreditsAdapter();
