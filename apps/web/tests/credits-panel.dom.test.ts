/**
 * DOM-level tests for the Credits panel's checkout gate (R07/PSP).
 *
 * The panel must enable the buy button ONLY when the backend reports a real
 * checkout provider, and must never fabricate a balance when signed out.
 * Adapters are mocked in-process; no network is possible.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const state = vi.hoisted(() => ({
  checkoutAvailable: true,
  signedIn: true,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement("a", { href }, children),
}));

vi.mock("@/lib/api/auth", () => ({
  AUTH_SERVICES_CONFIGURED: true,
  authAdapter: {
    getSession: async () =>
      state.signedIn
        ? {
            ok: true,
            data: {
              user: { id: "u", email: "u@example.test", displayName: null, avatarUrl: null },
              expiresAt: null,
            },
          }
        : { ok: true, data: null },
  },
}));

vi.mock("@/lib/api/credits", () => ({
  CREDIT_WALLET_SERVICES_CONFIGURED: true,
  creditsAdapter: {
    getWallet: async () => ({ ok: true, data: { credits: 42, updatedAt: null } }),
    listCreditPackages: async () => ({
      ok: true,
      data: [{ id: "starter", credits: 100, priceMinorUnits: 500, currency: "USD", label: "Starter" }],
    }),
    listCreditTransactions: async () => ({ ok: true, data: [] }),
    listPaymentOrders: async () => ({ ok: true, data: [] }),
    getPricing: async () => ({
      ok: true,
      data: {
        creditsPerGeneration: 10,
        costBoundMicros: 4_000_000,
        paymentProvider: state.checkoutAvailable ? "waffo" : "mock",
        checkoutAvailable: state.checkoutAvailable,
      },
    }),
    createCheckout: async () => ({
      ok: true,
      data: { orderId: "o1", checkoutUrl: "https://pay.example/s1" },
    }),
  },
}));

import CreditsClient from "@/components/credits/CreditsClient";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  state.checkoutAvailable = true;
  state.signedIn = true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(): Promise<void> {
  await act(async () => {
    root.render(createElement(CreditsClient, { locale: "en" }));
  });
  // Allow the parallel adapter promises to resolve and re-render.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Credits panel checkout gate", () => {
  it("shows the backend balance and enables buying when checkout is available", async () => {
    await render();
    // The overview shows the real available balance, not a static key.
    expect(container.textContent).toContain("availableCredits");
    expect(container.textContent).toContain("42");
    const buttons = [...container.querySelectorAll("button")];
    const buy = buttons.find((b) => b.textContent?.includes("checkoutButton"));
    expect(buy).toBeTruthy();
    expect(buy?.disabled).toBe(false);
  });

  it("keeps buying disabled when the backend has no real provider", async () => {
    state.checkoutAvailable = false;
    await render();
    const buttons = [...container.querySelectorAll("button")];
    const buy = buttons.find((b) => b.textContent?.includes("checkoutButton"));
    expect(buy).toBeTruthy();
    expect(buy?.disabled).toBe(true);
    expect(container.textContent).toContain("checkoutBlockedBody");
  });

  it("shows the sign-in prompt (no balance) when signed out", async () => {
    state.signedIn = false;
    await render();
    expect(container.textContent).toContain("signInPromptTitle");
    expect(container.textContent).not.toContain("balanceValue");
  });
});
