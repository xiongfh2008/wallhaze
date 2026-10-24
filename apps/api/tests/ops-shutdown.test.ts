import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

/**
 * POST /internal/shutdown is a dev-only convenience that lets `npm run stop`
 * close PGlite cleanly. It must not exist without a token, must reject a
 * wrong token, and must never be registered in production.
 */
it('is not registered when no token is configured', async () => {
  const { app } = await buildApp({ env: {} });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/internal/shutdown',
    });
    expect(response.statusCode).toBe(404);
  } finally {
    await app.close();
  }
});

it('requires the ops token and invokes the shutdown callback', async () => {
  let called = 0;
  const { app } = await buildApp({
    env: {},
    opsShutdownToken: 'test-ops-token',
    onShutdownRequested: () => {
      called += 1;
    },
  });
  try {
    expect(
      (await app.inject({ method: 'POST', url: '/internal/shutdown' })).statusCode
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/internal/shutdown',
          headers: { 'x-ops-token': 'wrong' },
        })
      ).statusCode
    ).toBe(401);

    const accepted = await app.inject({
      method: 'POST',
      url: '/internal/shutdown',
      headers: { 'x-ops-token': 'test-ops-token' },
    });
    expect(accepted.statusCode).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(called).toBe(1);
  } finally {
    await app.close();
  }
});

it('never registers the shutdown route in production', async () => {
  const { app } = await buildApp({
    env: { NODE_ENV: 'production' },
    opsShutdownToken: 'test-ops-token',
    onShutdownRequested: () => undefined,
  });
  try {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/internal/shutdown',
          headers: { 'x-ops-token': 'test-ops-token' },
        })
      ).statusCode
    ).toBe(404);
  } finally {
    await app.close();
  }
});
