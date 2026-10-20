import { afterAll, afterEach, beforeAll } from "vitest";
import { networkGuard } from "./helpers.js";

/**
 * Global test setup (T04-S2 port of the legacy tests/setup.ts network
 * isolation contract):
 *
 * - Baseline env hygiene: real developer secrets (FAL_KEY et al.) are
 *   removed from process.env so a suite that forgets to inject an env can
 *   never pick one up. All suites inject their env per app.
 * - Deny-all network guard: globalThis.fetch is replaced with a recorder
 *   that rejects EVERY call. The backend routes all outbound I/O through an
 *   injected fetchImpl, so any hit on the global fetch means a code path
 *   escaped the injection boundary — the afterEach gate fails the run and
 *   names the URL.
 */
const originalFetch = globalThis.fetch;

beforeAll(() => {
  delete process.env.FAL_KEY;
  delete process.env.FAL_MOCK;
  delete process.env.GENERATION_PAUSED;
  delete process.env.TRUST_PROXY;
  delete process.env.SITE_URL;

  const denyAll = ((input: unknown): Promise<Response> => {
    let url: string;
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.href;
    else url = String((input as Request | undefined)?.url ?? input);
    networkGuard.unexpectedCalls.push(url);
    return Promise.reject(
      new Error(`test network guard: outbound fetch blocked — ${url}`)
    );
  }) as unknown as typeof fetch;

  globalThis.fetch = denyAll;
  networkGuard.active = true;
});

afterEach(() => {
  if (networkGuard.unexpectedCalls.length > 0) {
    const urls = [...networkGuard.unexpectedCalls];
    networkGuard.clear();
    throw new Error(`Unexpected outbound fetch in test: ${urls.join(", ")}`);
  }
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  networkGuard.active = false;
});
