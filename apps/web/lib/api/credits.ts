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
  /** Video capability + pricing matrix from the backend. */
  video?: VideoPricing;
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
