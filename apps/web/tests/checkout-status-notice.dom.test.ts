/**
 * Pricing page checkout status notice — status-driven copy (jsdom).
 *
 * The notice shares the same latched pricing probe as CheckoutButton, so the
 * notice and the buy buttons can never disagree. While the probe is in
 * flight nothing is rendered — the page never claims an open or closed state
 * it has not proven. vi.resetModules() per test is required for the probe
 * singleton.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
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
  openTitle: "OpenTitle",
  openBody: "OpenBody",
  pausedTitle: "PausedTitle",
  pausedBody: "PausedBody",
  closedTitle: "ClosedTitle",
  closedBody: "ClosedBody",
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
      checkoutAvailable: true,
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
  const { default: CheckoutStatusNotice } = await import(
    "@/components/pricing/CheckoutStatusNotice"
  );
  const { default: CheckoutButton } = await import(
    "@/components/pricing/CheckoutButton"
  );
  const { creditsAdapter } = await import("@/lib/api/credits");
  return { CheckoutStatusNotice, CheckoutButton, creditsAdapter };
}

async function renderNotice(result: ApiResult<CreditsPricing>) {
  const { CheckoutStatusNotice, creditsAdapter } = await importComponent();
  vi.spyOn(creditsAdapter, "getPricing").mockResolvedValue(result);
  await act(async () => {
    root.render(createElement(CheckoutStatusNotice, LABELS));
  });
  await act(async () => {});
}

describe("checkout status notice gate", () => {
  it("renders nothing while the probe is in flight", async () => {
    const { CheckoutStatusNotice, creditsAdapter } = await importComponent();
    vi.spyOn(creditsAdapter, "getPricing").mockReturnValue(new Promise(() => {}));
    await act(async () => {
      root.render(createElement(CheckoutStatusNotice, LABELS));
    });
    expect(container.textContent).toBe("");
    expect(container.querySelector("section")).toBeNull();
  });

  it("shows the open copy when purchases are public and not paused", async () => {
    await renderNotice(
      pricingResult({ purchasesPublic: true, purchasesPaused: false }),
    );
    expect(container.textContent).toContain("OpenTitle");
    expect(container.textContent).toContain("OpenBody");
    expect(container.textContent).not.toContain("ClosedTitle");
    expect(container.textContent).not.toContain("PausedTitle");
  });

  it("shows the accurate paused copy while purchases are paused", async () => {
    await renderNotice(
      pricingResult({ purchasesPublic: true, purchasesPaused: true }),
    );
    expect(container.textContent).toContain("PausedTitle");
    expect(container.textContent).toContain("PausedBody");
    expect(container.textContent).not.toContain("OpenTitle");
  });

  it("shows the fail-closed copy when purchases are closed", async () => {
    await renderNotice(pricingResult({ purchasesPublic: false }));
    expect(container.textContent).toContain("ClosedTitle");
    expect(container.textContent).toContain("ClosedBody");
    expect(container.textContent).not.toContain("OpenTitle");
  });

  it("shows the fail-closed copy when the pricing probe fails", async () => {
    await renderNotice(unavailable);
    expect(container.textContent).toContain("ClosedTitle");
    expect(container.textContent).not.toContain("OpenTitle");
  });

  it("shares the same probe as CheckoutButton so notice and buttons agree", async () => {
    const { CheckoutStatusNotice, CheckoutButton, creditsAdapter } =
      await importComponent();
    const getPricing = vi
      .spyOn(creditsAdapter, "getPricing")
      .mockResolvedValue(
        pricingResult({ purchasesPublic: true, purchasesPaused: false }),
      );
    await act(async () => {
      root.render(
        createElement("div", null,
          createElement(CheckoutStatusNotice, LABELS),
          createElement(CheckoutButton, {
            buyLabel: "Buy",
            pausedLabel: "Paused",
            closedLabel: "Closed",
            loadingLabel: "Loading",
          }),
        ),
      );
    });
    await act(async () => {});
    expect(getPricing).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("OpenTitle");
    expect(container.querySelector('a[href="/credits"]')).not.toBeNull();
  });
});
