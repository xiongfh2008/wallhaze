/**
 * Pricing page buy button — status-driven checkout gate (jsdom).
 *
 * The button enables checkout navigation only when the pricing probe proves
 * purchasesPublic && !purchasesPaused; every other state (closed, paused,
 * probe failure, still loading) stays disabled with the honest reason.
 * vi.resetModules() per test is required because the component shares one
 * latched pricing probe across all instances on the page.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, Fragment } from "react";
import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement("a", { href }, children),
}));

import type { CreditsPricing } from "@/lib/api/credits";
import type { ApiResult } from "@/lib/api/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const LABELS = {
  buyLabel: "BuyLabel",
  pausedLabel: "PausedLabel",
  closedLabel: "ClosedLabel",
  loadingLabel: "LoadingLabel",
};

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
  vi.resetModules();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function importComponent() {
  const { default: CheckoutButton } = await import(
    "@/components/pricing/CheckoutButton"
  );
  const { creditsAdapter } = await import("@/lib/api/credits");
  return { CheckoutButton, creditsAdapter };
}

async function renderButton(result: ApiResult<CreditsPricing>) {
  const { CheckoutButton, creditsAdapter } = await importComponent();
  vi.spyOn(creditsAdapter, "getPricing").mockResolvedValue(result);
  await act(async () => {
    root.render(createElement(CheckoutButton, LABELS));
  });
  // Flush the probe microtask so the gate state is applied.
  await act(async () => {});
}

describe("pricing buy button gate", () => {
  it("stays disabled with the neutral label while the probe is in flight", async () => {
    const { CheckoutButton, creditsAdapter } = await importComponent();
    vi.spyOn(creditsAdapter, "getPricing").mockReturnValue(new Promise(() => {}));
    await act(async () => {
      root.render(createElement(CheckoutButton, LABELS));
    });
    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(container.textContent).toContain("LoadingLabel");
    expect(container.querySelector("a")).toBeNull();
  });

  it("enables checkout navigation when purchases are public and not paused", async () => {
    await renderButton(
      pricingResult({ purchasesPublic: true, purchasesPaused: false }),
    );
    const link = container.querySelector('a[href="/credits"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("BuyLabel");
    expect(container.querySelector("button")).toBeNull();
  });

  it("stays disabled with the coming-soon reason when purchases are closed", async () => {
    await renderButton(pricingResult({ purchasesPublic: false }));
    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(container.textContent).toContain("ClosedLabel");
    expect(container.querySelector("a")).toBeNull();
  });

  it("stays disabled with the paused reason while purchases are paused", async () => {
    await renderButton(
      pricingResult({ purchasesPublic: true, purchasesPaused: true }),
    );
    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(container.textContent).toContain("PausedLabel");
    expect(container.querySelector("a")).toBeNull();
  });

  it("stays disabled with the coming-soon reason when the probe fails", async () => {
    await renderButton(unavailable);
    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(container.textContent).toContain("ClosedLabel");
    expect(container.querySelector("a")).toBeNull();
  });

  it("shares one pricing probe across all buttons on the page", async () => {
    const { CheckoutButton, creditsAdapter } = await importComponent();
    const getPricing = vi
      .spyOn(creditsAdapter, "getPricing")
      .mockResolvedValue(
        pricingResult({ purchasesPublic: true, purchasesPaused: false }),
      );
    await act(async () => {
      root.render(
        createElement(
          Fragment,
          null,
          createElement(CheckoutButton, LABELS),
          createElement(CheckoutButton, LABELS),
          createElement(CheckoutButton, LABELS),
        ),
      );
    });
    await act(async () => {});
    expect(getPricing).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('a[href="/credits"]')).toHaveLength(3);
  });
});
