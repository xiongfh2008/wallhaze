/**
 * StudioGate commercial gating (jsdom): the /studio experience renders only
 * when the pricing probe proves studioPublic=true. Every other state —
 * explicit false, missing field, probe failure / no API configured — shows
 * the server-rendered closed fallback (fail-closed).
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { creditsAdapter, type CreditsPricing } from "@/lib/api/credits";
import type { ApiResult } from "@/lib/api/client";
import StudioGate from "@/components/studio/StudioGate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function pricingResult(
  data: Partial<CreditsPricing>,
): ApiResult<CreditsPricing> {
  return {
    ok: true,
    data: {
      creditsPerGeneration: 10,
      costBoundMicros: 0,
      paymentProvider: "waffo",
      checkoutAvailable: false,
      ...data,
    },
  };
}

const unavailable: ApiResult<CreditsPricing> = {
  ok: false,
  failure: { kind: "unavailable" },
  status: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderGate(
  open: ReactNode,
  closed: ReactNode,
  result: ApiResult<CreditsPricing>,
) {
  vi.spyOn(creditsAdapter, "getPricing").mockResolvedValue(result);
  await act(async () => {
    root.render(
      createElement(StudioGate, { children: open, fallback: closed })
    );
  });
}

describe("studio gate", () => {
  it("renders the experience when the backend proves studioPublic=true", async () => {
    await renderGate("OPEN", "CLOSED", pricingResult({ studioPublic: true }));
    expect(container.textContent).toBe("OPEN");
  });

  it("shows the closed fallback when studioPublic is false", async () => {
    await renderGate("OPEN", "CLOSED", pricingResult({ studioPublic: false }));
    expect(container.textContent).toBe("CLOSED");
  });

  it("stays closed when the pricing answer lacks the gate (fail-closed)", async () => {
    await renderGate("OPEN", "CLOSED", pricingResult({}));
    expect(container.textContent).toBe("CLOSED");
  });

  it("stays closed when the probe fails or no API is configured", async () => {
    await renderGate("OPEN", "CLOSED", unavailable);
    expect(container.textContent).toBe("CLOSED");
  });
});
