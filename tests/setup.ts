/**
 * Global test setup — runs before every test file (see vitest.config.ts
 * setupFiles), i.e. BEFORE route.ts or any business module is imported.
 *
 * Responsibilities (T03-B2 §5.1/§5.2):
 * 1. Seed ONLY fabricated environment values. The real .env.local is never
 *    read or loaded — the Vitest process does not run inside Next.js, so
 *    Next's dotenv loading never happens.
 * 2. Install a DENY-ALL fetch guard on globalThis BEFORE business modules
 *    load. Any unregistered outbound request is recorded as "unexpected" and
 *    rejected; the per-test afterEach hook turns any recorded call into a
 *    test failure — even when the route catches the rejection and returns 502.
 * 3. Expose an opt-in fal.ai mock (memory-only) that whitelists EXACTLY the
 *    two endpoints hardcoded in app/api/generate/route.ts.
 *
 * The harness instance is attached to globalThis because Vitest setup files
 * and test files are separate module instances; globalThis is the shared bus.
 *
 * Honest scope note (do not oversell): this guard protects the only network
 * exit found in the tested modules (the single global fetch in
 * app/api/generate/route.ts:495). It is process-level isolation, NOT
 * OS-level network isolation.
 */

import { beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// 1. Fabricated environment baseline (function-read env vars in the route are
//    re-read per request, so per-test vi.stubEnv can safely override these).
// ---------------------------------------------------------------------------
process.env.FAL_KEY = "test-dummy-not-a-real-key";
process.env.SITE_URL = "https://test.wallhaze.example";
delete process.env.GENERATION_PAUSED; // default: generation NOT paused
delete process.env.TRUST_PROXY; // default: shared "local" bucket semantics

// ---------------------------------------------------------------------------
// 2. Network guard + fal mock harness
// ---------------------------------------------------------------------------

/** Endpoints exactly as hardcoded in app/api/generate/route.ts:36-37. */
const FAL_ENDPOINT = "https://fal.run/fal-ai/flux-2/klein/4b";
const FAL_EDIT_ENDPOINT = "https://fal.run/fal-ai/flux-2/klein/4b/edit";

export interface FalMockHandler {
  (url: string, init: RequestInit): Response | Promise<Response>;
}

export interface RecordedFalCall {
  url: string;
  init: RequestInit;
}

export interface NetworkHarness {
  /** Outbound requests that hit NO registered handler — must stay empty. */
  unexpectedCalls: { url: string }[];
  /** Calls accepted by the installed fal mock (for payload assertions). */
  falCalls: RecordedFalCall[];
  /** true while the deny-all guard (not a fal mock) owns globalThis.fetch. */
  guardActive: boolean;
  installFalMock(handler: FalMockHandler): void;
  uninstallFalMock(): void;
  clearRecordings(): void;
}

function urlFromInput(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const harness: NetworkHarness = {
  unexpectedCalls: [],
  falCalls: [],
  guardActive: true,

  installFalMock(handler: FalMockHandler): void {
    harness.guardActive = false;
    harness.clearRecordings();
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      const url = urlFromInput(input);
      if (url === FAL_ENDPOINT || url === FAL_EDIT_ENDPOINT) {
        harness.falCalls.push({ url, init: init ?? {} });
        return handler(url, init ?? {});
      }
      // Any other URL — including localhost:3000, real CDNs, anything — is an
      // unexpected outbound call. Recorded FIRST, then rejected, so a route
      // that catches the error and maps it to a 502 still fails the test in
      // the afterEach gate below.
      harness.unexpectedCalls.push({ url });
      throw new Error(
        `[network-guard] unexpected outbound request blocked: ${url}`
      );
    }) as typeof fetch;
  },

  uninstallFalMock(): void {
    harness.guardActive = true;
    globalThis.fetch = guardFetch;
  },

  clearRecordings(): void {
    harness.unexpectedCalls.length = 0;
    harness.falCalls.length = 0;
  },
};

/**
 * Deny-all guard. Installed before any business module is imported. Every
 * outbound attempt is recorded and rejected — tests must fail, never touch
 * the network.
 */
const guardFetch = (async (input: RequestInfo | URL): Promise<Response> => {
  const url = urlFromInput(input);
  harness.unexpectedCalls.push({ url });
  throw new Error(`[network-guard] unexpected outbound request blocked: ${url}`);
}) as typeof fetch;

globalThis.fetch = guardFetch;
(globalThis as unknown as { __wallhazeTestNetwork__?: NetworkHarness }).__wallhazeTestNetwork__ =
  harness;

// ---------------------------------------------------------------------------
// 3. Global per-test hygiene: fresh recordings and guard ownership each test,
//    and a hard gate that any unexpected network call fails the test.
// ---------------------------------------------------------------------------
beforeEach(() => {
  harness.uninstallFalMock();
  harness.clearRecordings();
});

afterEach(() => {
  if (harness.unexpectedCalls.length > 0) {
    const urls = harness.unexpectedCalls.map((c) => c.url).join(", ");
    // A case that intentionally exercises the guard (e.g. GEN-28) must clear
    // the list itself after asserting on it; anything left here is a leak.
    throw new Error(
      `[network-guard] ${harness.unexpectedCalls.length} unexpected outbound request(s) occurred: ${urls}`
    );
  }
});
