/**
 * Confirm-dialog gate: no Confirm control without an affordable balance.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: React.ReactNode }) =>
    createElement("a", { href }, children),
}));

import GenerationConfirmDialog from "@/components/studio/GenerationConfirmDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

const summary = {
  prompt: "a calm sea",
  styleLabel: "Minimalist",
  deviceLabel: "Desktop",
  selection: { device: "desktop" as const, ratio: "16:9" as const, presetId: null },
  presetLabel: "Desktop Full HD",
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("generation confirm dialog", () => {
  it("offers Confirm when the balance covers the price", () => {
    act(() => {
      root.render(
        createElement(GenerationConfirmDialog, {
          open: true,
          onClose: () => undefined,
          summary,
          priceCredits: 10,
          canConfirm: true,
          onConfirm: () => undefined,
        })
      );
    });
    const buttons = [...document.querySelectorAll("button")].map((b) =>
      b.textContent?.trim()
    );
    expect(buttons).toContain("confirmClose");
    expect(buttons).toContain("confirm");
  });

  it("hides Confirm and explains why when approval is blocked", () => {
    act(() => {
      root.render(
        createElement(GenerationConfirmDialog, {
          open: true,
          onClose: () => undefined,
          summary,
          priceCredits: 10,
          canConfirm: false,
          creditsMessage: "Not enough Credits for this generation.",
          onConfirm: () => undefined,
        })
      );
    });
    const text = container.textContent ?? "";
    expect(text).toContain("Not enough Credits");
    const buttons = [...document.querySelectorAll("button")].map((b) =>
      b.textContent?.trim()
    );
    expect(buttons).not.toContain("confirm");
  });
});
