/**
 * Vitest global safety net (FE04-A).
 *
 * Hard rule: tests never reach the real network. The global fetch is
 * replaced by a recording guard before every test — any outbound request
 * (registered or not) throws immediately and is logged so tests can assert
 * on the interception itself. All mock traffic stays inside the test
 * process through the injected `fetchImpl` seam on apiRequest.
 */

import { afterEach, beforeEach, vi } from "vitest";

/** One blocked outbound attempt, kept for the safety self-checks. */
export interface BlockedNetworkCall {
  url: string;
  method: string;
}

const blockedCalls: BlockedNetworkCall[] = [];

const networkGuard = ((url: RequestInfo | URL, init?: RequestInit) => {
  const entry: BlockedNetworkCall = {
    url: typeof url === "string" ? url : String(url),
    method: (init?.method ?? "GET").toUpperCase(),
  };
  blockedCalls.push(entry);
  throw new Error(
    `[network-guard] Outbound request blocked in tests: ${entry.method} ${entry.url}`
  );
}) as unknown as typeof fetch;

beforeEach(() => {
  blockedCalls.length = 0;
  vi.stubGlobal("fetch", networkGuard);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The outbound attempts the guard intercepted during the current test. */
export function getBlockedNetworkCalls(): readonly BlockedNetworkCall[] {
  return blockedCalls;
}

/** Asserts nothing tried to leave the process. Also true when apiRequest
 * short-circuits with "unavailable" before fetch is ever consulted. */
export function expectNoNetworkCalls(): void {
  if (blockedCalls.length > 0) {
    throw new Error(
      `[network-guard] Expected zero outbound requests, got: ${blockedCalls
        .map((call) => `${call.method} ${call.url}`)
        .join(", ")}`
    );
  }
}
