/**
 * Credits notice state rendering (jsdom).
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement("a", { href }, children),
}));

import CreditsNotice, {
  type CreditsNoticeState,
} from "@/components/studio/CreditsNotice";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

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
});

function render(
  state: CreditsNoticeState,
  price: number | null,
  balance: number | null,
  mock = false,
) {
  act(() => {
    root.render(
      createElement(CreditsNotice, { state, priceCredits: price, balance, mock })
    );
  });
  return container.textContent ?? "";
}

describe("credits notice states", () => {
  it("shows the server price and balance when ready", () => {
    const text = render("ready", 10, 100);
    expect(text).toContain("perGeneration");
    expect(text).toContain("balanceLine");
  });

  it("asks signed-out visitors to sign in", () => {
    const text = render("signed-out", 10, null);
    expect(text).toContain("signedOutBody");
    // The login link carries the current page so the user returns to Studio.
    expect(container.querySelector('a[href^="/login"]')).not.toBeNull();
  });

  it("blocks with an insufficient-balance message and a top-up link", () => {
    const text = render("insufficient", 10, 3);
    expect(text).toContain("insufficientTitle");
    expect(container.querySelector('a[href="/credits"]')).not.toBeNull();
  });

  it("does not claim Credits are required while a generation is running", () => {
    const text = render("in-flight", 10, 100);
    expect(text).toContain("inFlightTitle");
    expect(text).not.toContain("notice");
  });

  it("stays honest when services are unavailable", () => {
    expect(render("unavailable", null, null)).toContain("unavailableNotice");
  });

  it("reports an operator pause instead of blaming the account", () => {
    const text = render("paused", 10, 100);
    expect(text).toContain("servicePausedTitle");
    expect(text).toContain("servicePausedNotice");
    // A paused service must not sell a price or ask for sign-in.
    expect(text).not.toContain("perGeneration");
    expect(text).not.toContain("signedOutBody");
  });

  it("reports an unconfigured generation service", () => {
    const text = render("service-disabled", 10, null);
    expect(text).toContain("serviceDisabledTitle");
    expect(text).toContain("serviceDisabledNotice");
  });

  it("labels the ready state as a test preview in mock mode", () => {
    const text = render("ready", 10, 100, true);
    expect(text).toContain("mockReadyTitle");
    expect(text).toContain("mockReadyNotice");
    // Mock never claims a charge.
    expect(text).not.toContain("perGeneration");
  });

  it("does not claim a reservation while a mock generation runs", () => {
    const text = render("in-flight", 10, 100, true);
    expect(text).toContain("inFlightMockBody");
    expect(text).not.toContain("inFlightBody");
  });
});
