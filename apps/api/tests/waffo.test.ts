import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign as rsaSign } from 'node:crypto';
import type { WaffoPancake } from '@waffo/pancake-ts';
import { WaffoPaymentAdapter, toMinorUnits } from '../src/business/waffo.js';

/**
 * Adapter-level tests. Webhook verification uses a locally generated RSA
 * keypair injected through WAFFO_WEBHOOK_TEST_PUBLIC_KEY, so the full
 * signature → normalization path is exercised without contacting Waffo.
 */

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function signedHeader(payload: string, stamp = Date.now()): string {
  const signature = rsaSign('RSA-SHA256', Buffer.from(`${stamp}.${payload}`), privateKey).toString('base64');
  return `t=${stamp},v1=${signature}`;
}

function fakeClient(onSession?: (params: unknown) => void): WaffoPancake {
  return {
    checkout: {
      createSession: async (params: unknown) => {
        onSession?.(params);
        return { sessionId: 'SES_1', checkoutUrl: 'https://pay.waffo.test/s/1', expiresAt: '2026-01-01T00:00:00.000Z' };
      },
    },
  } as unknown as WaffoPancake;
}

function event(overrides: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 'dlv_1',
    timestamp: new Date().toISOString(),
    eventType: 'order.completed',
    eventId: 'PAY_1',
    storeId: 'STO_test',
    mode: 'test',
    data: {
      orderId: 'ORD_waffo_1',
      buyerEmail: 'buyer@example.test',
      currency: 'USD',
      amount: '5.00',
      taxAmount: '0.45',
      productName: 'Starter',
      orderMerchantExternalId: 'internal-order-1',
      listPrice: { total: '5.45', subtotal: '5.00', taxAmount: '0.45' },
      chargedAmount: '5.45',
      paymentId: 'PAY_1',
      ...data,
    },
    ...overrides,
  });
}

beforeEach(() => { process.env.WAFFO_WEBHOOK_TEST_PUBLIC_KEY = publicPem; });
afterEach(() => { delete process.env.WAFFO_WEBHOOK_TEST_PUBLIC_KEY; vi.restoreAllMocks(); });

describe('Waffo adapter', () => {
  it('verifies and normalizes order.completed using the pre-tax subtotal', () => {
    const adapter = new WaffoPaymentAdapter(fakeClient(), 'test');
    const payload = event();
    expect(adapter.parseWebhook(payload, signedHeader(payload))).toMatchObject({
      id: 'dlv_1',
      kind: 'paid',
      orderId: 'internal-order-1',
      paymentId: 'PAY_1',
      amountMinor: 500,
      currency: 'USD',
    });
  });

  it('falls back to order metadata when the external id is absent', () => {
    const adapter = new WaffoPaymentAdapter(fakeClient(), 'test');
    const payload = event({}, { orderMerchantExternalId: undefined, orderMetadata: { orderId: 'meta-order' } });
    expect(adapter.parseWebhook(payload, signedHeader(payload))).toMatchObject({ kind: 'paid', orderId: 'meta-order' });
  });

  it('maps refund.succeeded from the original payment subtotal', () => {
    const adapter = new WaffoPaymentAdapter(fakeClient(), 'test');
    const payload = event(
      { eventType: 'refund.succeeded' },
      { originalPayment: { total: '5.45', subtotal: '5.00', taxAmount: '0.45' }, refundedAmount: '5.45' }
    );
    expect(adapter.parseWebhook(payload, signedHeader(payload))).toMatchObject({
      kind: 'refunded', orderId: 'internal-order-1', amountMinor: 500,
    });
  });

  it('acknowledges unrelated events without touching money', () => {
    const adapter = new WaffoPaymentAdapter(fakeClient(), 'test');
    const payload = event({ eventType: 'subscription.activated' });
    expect(adapter.parseWebhook(payload, signedHeader(payload))).toMatchObject({ kind: 'ignored' });
  });

  it('rejects tampered payloads, wrong environment and missing order references', () => {
    const adapter = new WaffoPaymentAdapter(fakeClient(), 'test');
    const payload = event();
    const header = signedHeader(payload);
    expect(() => adapter.parseWebhook(payload.replace('5.00', '1.00'), header)).toThrow(/signature/i);

    const prodPayload = event({ mode: 'prod' });
    expect(() => adapter.parseWebhook(prodPayload, signedHeader(prodPayload))).toThrow(/environment/i);

    const noRef = event({}, { orderMerchantExternalId: undefined, orderMetadata: undefined });
    expect(() => adapter.parseWebhook(noRef, signedHeader(noRef))).toThrow(/order reference/i);
  });

  it('creates a session with the internal order reference and no cross-package metadata leak', async () => {
    let captured: unknown;
    const adapter = new WaffoPaymentAdapter(fakeClient((params) => { captured = params; }), 'test');
    const session = await adapter.createCheckout({
      orderId: 'internal-order-9',
      packageId: 'starter',
      buyerEmail: 'buyer@example.test',
      amountMinor: 500,
      currency: 'USD',
      successUrl: 'https://web.example/en/credits',
      cancelUrl: 'https://web.example/en/credits',
      providerProductId: 'PROD_starter',
    });
    expect(session).toMatchObject({ checkoutUrl: 'https://pay.waffo.test/s/1', providerCheckoutId: 'SES_1' });
    expect(captured).toMatchObject({
      productId: 'PROD_starter',
      currency: 'USD',
      buyerEmail: 'buyer@example.test',
      orderMerchantExternalId: 'internal-order-9',
      metadata: { orderId: 'internal-order-9', packageId: 'starter' },
    });
  });

  it('refuses checkout without a mapped product', async () => {
    const adapter = new WaffoPaymentAdapter(fakeClient(), 'test');
    await expect(
      adapter.createCheckout({
        orderId: 'o', packageId: 'p', buyerEmail: null, amountMinor: 1,
        currency: 'USD', successUrl: 'https://web.example/a', cancelUrl: 'https://web.example/a',
        providerProductId: null,
      })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});

describe('Waffo money conversion', () => {
  it('handles two-, zero- and three-decimal currencies', () => {
    expect(toMinorUnits('5.00', 'USD')).toBe(500);
    expect(toMinorUnits('5.4', 'USD')).toBe(540);
    expect(toMinorUnits('1000', 'JPY')).toBe(1000);
    expect(toMinorUnits('1.234', 'KWD')).toBe(1234);
  });
  it('rejects malformed and over-precise amounts', () => {
    expect(() => toMinorUnits('5,00', 'USD')).toThrow();
    expect(() => toMinorUnits('5.001', 'USD')).toThrow();
    expect(() => toMinorUnits('1.5', 'JPY')).toThrow();
  });
});
