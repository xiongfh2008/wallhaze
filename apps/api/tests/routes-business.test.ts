import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createMemoryDatabase, type Database } from '../src/db/database.js';
import { signMockEvent } from '../src/business/payment.js';
import { runWorkerOnce } from '../src/business/worker.js';
import { MockJobProvider } from '../src/business/providers.js';
import { MemoryStorage } from '../src/business/storage.js';
import { credit } from '../src/business/wallet.js';

const SECRET = 'test-only-payment-signature-secret';

describe('business HTTP surface', () => {
  let db: Database;
  let cleanup: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    db = await createMemoryDatabase();
  });
  afterEach(async () => {
    await cleanup?.();
    await db.close();
  });

  type App = Awaited<ReturnType<typeof buildApp>>["app"] & { storage: MemoryStorage };
  async function boot(env: Record<string, string> = {}): Promise<App> {
    const appStorage = new MemoryStorage();
    const { app } = await buildApp({
      env: {
        CORS_ALLOWED_ORIGINS: 'https://web.example',
        PAYMENT_MOCK_SECRET: SECRET,
        ...env,
      },
      database: db,
      paymentSecret: SECRET,
      storage: appStorage,
      userDailyCostLimitMicros: 10_000_000,
    });
    (app as unknown as { storage: MemoryStorage }).storage = appStorage;
    cleanup = async () => app.close();
    return app as App;
  }

  const WEB = {
    'x-wallhaze-client': 'web',
    'content-type': 'application/json',
    origin: 'https://web.example',
  };

  async function signUp(app: Awaited<ReturnType<typeof boot>>, email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      headers: WEB,
      payload: { email, password: 'example-password-long' },
    });
    expect(res.statusCode).toBe(200);
    return res.cookies;
  }

  function cookieHeader(cookies: Array<{ name: string; value: string }>) {
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  }

  it('signs up, resolves the session from the cookie, and signs out', async () => {
    const app = await boot();
    const cookies = await signUp(app, 'User@example.test');
    const session = await app.inject({ method: 'GET', url: '/v1/auth/session', headers: { cookie: cookieHeader(cookies) } });
    expect(session.json()).toMatchObject({ user: { email: 'user@example.test' } });
    const logout = await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: { ...WEB, cookie: cookieHeader(cookies) }, payload: {} });
    expect(logout.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/auth/session', headers: { cookie: cookieHeader(cookies) } })).json()).toBeNull();
  });

  it('blocks cross-site browser writes and unauthenticated reads', async () => {
    const app = await boot();
    const evil = await app.inject({
      method: 'POST', url: '/v1/auth/signup',
      headers: { 'x-wallhaze-client': 'web', 'content-type': 'application/json', origin: 'https://evil.test' },
      payload: { email: 'x@example.test', password: 'example-password-long' },
    });
    expect(evil.statusCode).toBe(403);
    const noHeader = await app.inject({
      method: 'POST', url: '/v1/auth/signup',
      headers: { 'content-type': 'application/json', origin: 'https://web.example' },
      payload: { email: 'x@example.test', password: 'example-password-long' },
    });
    expect(noHeader.statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/v1/credits/wallet' })).statusCode).toBe(401);
  });

  it('refuses async job creation while generation is paused', async () => {
    const app = await boot({ GENERATION_PAUSED: '1' });
    const cookies = await signUp(app, 'paused@example.test');
    const user = (
      await db.query<{ id: string }>(
        "SELECT id FROM users WHERE email='paused@example.test'"
      )
    ).rows[0];
    await db.transaction((tx) => credit(tx, user.id, 100, 'pause-fund', 'test'));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/generations/jobs',
      headers: {
        ...WEB,
        cookie: cookieHeader(cookies),
        'idempotency-key': 'paused-1',
      },
      payload: {
        prompt: 'a cat',
        device: 'desktop',
        ratio: '16:9',
        sizePresetId: null,
        imageSize: { width: 1280, height: 720 },
      },
    });
    expect(response.statusCode).toBe(503);
    expect(
      (await db.query('SELECT balance,reserved FROM credit_wallets WHERE user_id=$1', [user.id])).rows[0]
    ).toMatchObject({ balance: 100, reserved: 0 });
    expect((await db.query('SELECT count(*)::int AS n FROM generation_jobs')).rows[0].n).toBe(0);
  });

  it('reports the runtime generation mode on the pricing endpoint', async () => {
    const app = await boot();
    const pricing = await app.inject({ method: 'GET', url: '/v1/credits/pricing' });
    // Tests inject no provider and set no FAL_* flags → fail-closed.
    expect(pricing.json()).toMatchObject({ generationMode: 'disabled' });
  });

  it('purchases credits via mock checkout and webhook, then reserves on job creation', async () => {
    const app = await boot();
    const cookies = await signUp(app, 'buyer@example.test');
    const auth = { cookie: cookieHeader(cookies) };
    const packages = await app.inject({ method: 'GET', url: '/v1/credits/packages' });
    expect(Array.isArray(packages.json())).toBe(true);
    expect(packages.json().length).toBeGreaterThan(0);

    const checkout = await app.inject({
      method: 'POST', url: '/v1/payments/checkout',
      headers: { ...WEB, ...auth, 'idempotency-key': 'key-1' },
      payload: { packageId: 'starter', successUrl: 'https://web.example/en/credits', cancelUrl: 'https://web.example/en/credits' },
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().orderId).toBeTruthy();

    // The frontend gate reads this endpoint: the mock provider is not a real
    // checkout, so the buy button must stay disabled.
    const pricing = await app.inject({ method: 'GET', url: '/v1/credits/pricing' });
    expect(pricing.json()).toMatchObject({
      creditsPerGeneration: 10,
      paymentProvider: 'mock',
      checkoutAvailable: false,
    });

    const payload = JSON.stringify({ id: 'evt-http-1', type: 'paid', orderId: checkout.json().orderId, paymentId: 'pay-1', amountMinor: 500, currency: 'USD' });
    const hook = await app.inject({
      method: 'POST', url: '/v1/payments/webhook',
      headers: { 'content-type': 'application/json', 'x-signature': signMockEvent(payload, SECRET) },
      payload,
    });
    expect(hook.statusCode).toBe(200);

    const wallet = await app.inject({ method: 'GET', url: '/v1/credits/wallet', headers: auth });
    expect(wallet.json()).toMatchObject({ credits: 100 });

    const job = await app.inject({
      method: 'POST', url: '/v1/generations/jobs',
      headers: { ...WEB, ...auth, 'idempotency-key': 'job-key-1' },
      payload: { prompt: 'a wallpaper', styleId: 'anime', device: 'desktop', ratio: '16:9', sizePresetId: null, imageSize: { width: 1280, height: 720 } },
    });
    expect(job.statusCode).toBe(202);
    expect(job.json()).toMatchObject({ status: 'queued', priceCredits: 10 });
    const replay = await app.inject({
      method: 'POST', url: '/v1/generations/jobs',
      headers: { ...WEB, ...auth, 'idempotency-key': 'job-key-1' },
      payload: { prompt: 'a wallpaper', device: 'desktop', ratio: '16:9', sizePresetId: null, imageSize: { width: 1280, height: 720 } },
    });
    expect(replay.json().jobId).toBe(job.json().jobId);

    // The server persists the composed prompt with the job (style template +
    // visual axes + device framing), so later template edits cannot change it.
    const stored = (
      await db.query(
        "SELECT request FROM generation_jobs WHERE user_id=(SELECT id FROM users WHERE email='buyer@example.test')"
      )
    ).rows[0].request as { _composed?: { prompt?: string; builderVersion?: number } };
    expect(stored._composed?.builderVersion).toBeGreaterThan(0);
    expect(stored._composed?.prompt).toContain('Palette:');
    expect(stored._composed?.prompt).toContain('Wide desktop wallpaper composition');
    expect((await app.inject({ method: 'GET', url: '/v1/credits/wallet', headers: auth })).json().credits).toBe(100);

    // Worker executes the job end-to-end; user then sees the creation.
    await runWorkerOnce(db, { provider: new MockJobProvider(), storage: app.storage }, 'test-worker');
    const creations = await app.inject({ method: 'GET', url: '/v1/creations', headers: auth });
    expect(creations.json().items).toHaveLength(1);
    const creation = creations.json().items[0];
    expect(creation.status).toBe('succeeded');
    expect((await app.inject({ method: 'GET', url: '/v1/credits/wallet', headers: auth })).json().credits).toBe(90);

    const image = await app.inject({ method: 'GET', url: creation.imageUrl, headers: auth });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');

    // Another user can never see or fetch the first user's creation.
    const otherCookies = await signUp(app, 'other@example.test');
    const other = { cookie: cookieHeader(otherCookies) };
    expect((await app.inject({ method: 'GET', url: '/v1/creations', headers: other })).json().items).toHaveLength(0);
    // Cookie auth without a signature is owner-scoped.
    expect((await app.inject({ method: 'GET', url: `/v1/creations/${creation.id}/image`, headers: other })).statusCode).toBe(404);
    // A tampered signature is rejected (404 avoids leaking existence).
    expect((await app.inject({ method: 'GET', url: `${creation.imageUrl}x`, headers: other })).statusCode).toBe(404);
    // Without any credential, an unsigned private image is unauthenticated.
    expect((await app.inject({ method: 'GET', url: `/v1/creations/${creation.id}/image` })).statusCode).toBe(401);
    // The signed URL itself is a capability (like a presigned S3 link).
    expect((await app.inject({ method: 'GET', url: creation.imageUrl })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/v1/orders`, headers: other })).json().items).toHaveLength(0);
  });

  it('releases reserved credits when the worker fails a job', async () => {
    const app = await boot();
    const cookies = await signUp(app, 'fail@example.test');
    const auth = { cookie: cookieHeader(cookies) };

    // Seed credits through the real mock payment path.
    const checkout = await app.inject({
      method: 'POST', url: '/v1/payments/checkout',
      headers: { ...WEB, ...auth, 'idempotency-key': 'fail-buy' },
      payload: { packageId: 'starter', successUrl: 'https://web.example/en/credits', cancelUrl: 'https://web.example/en/credits' },
    });
    const raw = JSON.stringify({ id: 'evt-fail-1', type: 'paid', orderId: checkout.json().orderId, paymentId: 'pay-fail', amountMinor: 500, currency: 'USD' });
    await app.inject({
      method: 'POST', url: '/v1/payments/webhook',
      headers: { 'content-type': 'application/json', 'x-signature': signMockEvent(raw, SECRET) },
      payload: raw,
    });

    const job = await app.inject({
      method: 'POST', url: '/v1/generations/jobs',
      headers: { ...WEB, ...auth, 'idempotency-key': 'fail-job' },
      payload: { prompt: 'will fail', device: 'phone' },
    });
    expect(job.statusCode).toBe(202);
    expect((await app.inject({ method: 'GET', url: '/v1/credits/wallet', headers: auth })).json().credits).toBe(100);

    await runWorkerOnce(
      db,
      {
        provider: { generate: async () => { throw new Error('upstream down'); } },
        storage: app.storage,
      },
      'failing-worker'
    );

    const status = await app.inject({ method: 'GET', url: `/v1/generations/jobs/${job.json().jobId}`, headers: auth });
    expect(status.json()).toMatchObject({ status: 'failed', errorCode: 'UPSTREAM_ERROR', imageUrl: null });
    expect((await app.inject({ method: 'GET', url: '/v1/credits/wallet', headers: auth })).json().credits).toBe(100);
    // Failed jobs never appear in the creations list (only succeeded ones).
    expect((await app.inject({ method: 'GET', url: '/v1/creations', headers: auth })).json().items).toHaveLength(0);
  });

  it('rejects a webhook with a bad signature and mismatched amounts', async () => {
    const app = await boot();
    const cookies = await signUp(app, 'hook@example.test');
    const auth = { cookie: cookieHeader(cookies) };
    const checkout = await app.inject({
      method: 'POST', url: '/v1/payments/checkout',
      headers: { ...WEB, ...auth, 'idempotency-key': 'k' },
      payload: { packageId: 'starter', successUrl: 'https://web.example/en/credits', cancelUrl: 'https://web.example/en/credits' },
    });
    const badSig = await app.inject({
      method: 'POST', url: '/v1/payments/webhook',
      headers: { 'content-type': 'application/json', 'x-signature': 'deadbeef' },
      payload: JSON.stringify({ id: 'e', type: 'paid', orderId: checkout.json().orderId, paymentId: 'p', amountMinor: 500, currency: 'USD' }),
    });
    expect(badSig.statusCode).toBe(403);
    const raw = JSON.stringify({ id: 'e2', type: 'paid', orderId: checkout.json().orderId, paymentId: 'p', amountMinor: 1, currency: 'USD' });
    const badAmount = await app.inject({
      method: 'POST', url: '/v1/payments/webhook',
      headers: { 'content-type': 'application/json', 'x-signature': signMockEvent(raw, SECRET) },
      payload: raw,
    });
    expect(badAmount.statusCode).toBe(409);
  });
});
