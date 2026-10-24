/**
 * DOM-level tests (jsdom) for the FE05 AuthPanel and the FE07
 * MyCreationsClient grid.
 *
 * Rendering runs through react-dom/client directly (createRoot + act) —
 * no component-testing framework is involved, because @testing-library/dom
 * is deliberately NOT installed this round. next-intl and the locale-aware
 * Link are mocked; translations resolve against the REAL en.json so the
 * assertions pin the actual shipped copy. The network guard from
 * setup.safety stays active for every test.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import {
  createElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";

// Type-only import — erased at runtime, so it does not defeat the mock.
import type WallpaperImage from "@/components/WallpaperImage";
import AuthPanel from "@/components/auth/AuthPanel";
import MyCreationsClient from "@/components/creations/MyCreationsClient";
import { downloadImage } from "@/lib/download";
import {
  addGenerationHistory,
  type GenerationHistoryEntry,
  type GenerationHistoryInput,
} from "@/lib/history";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    className,
    onClick,
    children,
  }: {
    href: string;
    className?: string;
    onClick?: () => void;
    children?: ReactNode;
  }) =>
    createElement(
      "a",
      { href, className, onClick },
      children
    ),
}));

vi.mock("next-intl", async () => {
  const { default: en } = await import("../messages/en.json");
  const messages = en as unknown as Record<string, Record<string, string>>;
  return {
    useTranslations:
      (namespace: string) =>
      (key: string, values?: Record<string, unknown>): string => {
        const template = messages[namespace]?.[key] ?? `${namespace}.${key}`;
        if (!values) return template;
        return template.replace(
          /\{(\w+)\}/g,
          (match, name: string): string =>
            Object.prototype.hasOwnProperty.call(values, name)
              ? String(values[name])
              : match
        );
      },
  };
});

vi.mock("@/components/WallpaperImage", () => ({
  default: ({ src, alt, onError }: ComponentProps<typeof WallpaperImage>) =>
    createElement("img", { src, alt, onError }),
}));

// downloadImage is replaced per-test; the in-flight bookkeeping helpers stay
// real so busy-state behavior is exercised end-to-end.
vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return { ...actual, downloadImage: vi.fn() };
});

/* ---- Minimal react-dom rendering harness ---- */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

interface Rendered {
  root: Root;
  container: HTMLElement;
}

const rendered: Rendered[] = [];

function renderUI(element: ReactElement): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  rendered.push({ root, container });
  return container;
}

afterEach(() => {
  for (const { root, container } of rendered) {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
  rendered.length = 0;
  vi.restoreAllMocks();
});

beforeEach(() => {
  window.localStorage.clear();
});

/* ---- Component-specific helpers ---- */

let seq = 0;

function addLocalEntry(
  overrides: Partial<GenerationHistoryInput> = {}
): GenerationHistoryEntry {
  seq += 1;
  const entry = addGenerationHistory({
    prompt: `Prompt ${seq}`,
    styleId: null,
    device: "phone",
    imageUrl: `https://cdn.example.com/creation-${seq}.png`,
    width: 1080,
    height: 1920,
    hasReferenceImage: false,
    ...overrides,
  });
  if (entry === null) throw new Error("local history write failed");
  return entry;
}

function findButton(
  container: HTMLElement,
  text: string
): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(text)
    ) ?? null
  );
}

async function clickButton(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
  });
}

/* ---- AuthPanel (FE05) ---- */

describe("AuthPanel (FE05)", () => {
  it("renders a structurally disabled sign-in panel with no credential inputs", () => {
    const container = renderUI(createElement(AuthPanel, { mode: "login" }));

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => {
      expect(button.disabled).toBe(true);
    });

    // No input fields exist, so no email/password can even be collected.
    expect(container.querySelectorAll("input")).toHaveLength(0);

    expect(container.textContent).toContain(
      "Account services are not connected yet"
    );
    expect(container.textContent).toContain("Continue with Google");
    expect(container.textContent).toContain("Continue with email");
  });

  it("links back home, to the mode toggle and to the legal drafts", () => {
    const container = renderUI(createElement(AuthPanel, { mode: "login" }));
    expect(container.querySelector('a[href="/"]')).not.toBeNull();
    expect(container.querySelector('a[href="/signup"]')).not.toBeNull();
    expect(container.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(container.querySelector('a[href="/terms"]')).not.toBeNull();
  });

  it("signup mode renders the registration title and the login toggle", () => {
    const container = renderUI(createElement(AuthPanel, { mode: "signup" }));
    expect(container.textContent).toContain("Create your WallHaze account");
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
  });
});

/* ---- MyCreationsClient (FE07) ---- */

describe("MyCreationsClient (FE07)", () => {
  it("renders the empty state when nothing is stored locally", () => {
    const container = renderUI(createElement(MyCreationsClient));
    expect(container.textContent).toContain("No creations yet");
    expect(container.querySelector('a[href="/studio"]')).not.toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });

  it("renders locally stored records without leaking image data", () => {
    addLocalEntry({ prompt: "Neon city" });
    addLocalEntry({ prompt: "Misty forest" });
    const container = renderUI(createElement(MyCreationsClient));

    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.textContent).toContain("Neon city");
    expect(container.textContent).toContain("Misty forest");
    expect(
      container.querySelector('[aria-live="polite"]')
    ).not.toBeNull();
    // History stores URLs only — no base64/data: payload may reach the DOM.
    expect(container.innerHTML).not.toContain("data:image");
    expect(container.innerHTML).not.toContain("base64");
  });

  it("deletes a local record after a real confirmation and syncs storage", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const kept = addLocalEntry({ prompt: "Keep me" });
    const doomed = addLocalEntry({ prompt: "Delete me" });
    const container = renderUI(createElement(MyCreationsClient));
    expect(container.querySelectorAll("li")).toHaveLength(2);

    const deleteButton = findButton(container, "Delete");
    expect(deleteButton).not.toBeNull();
    await clickButton(deleteButton as HTMLButtonElement);

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("Delete this local record?")
    );
    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(container.textContent).toContain("Keep me");
    expect(container.textContent).not.toContain("Delete me");
    expect(container.textContent).toContain("Local record deleted.");

    const stored = JSON.parse(
      window.localStorage.getItem("wallhaze:history:v1") ?? "[]"
    ) as Array<{ id: string }>;
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(kept.id);
    expect(stored.map((entry) => entry.id)).not.toContain(doomed.id);
  });

  it("keeps the record when the user cancels the confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    addLocalEntry({ prompt: "Stay" });
    const container = renderUI(createElement(MyCreationsClient));

    const deleteButton = findButton(container, "Delete");
    expect(deleteButton).not.toBeNull();
    await clickButton(deleteButton as HTMLButtonElement);

    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(container.textContent).toContain("Stay");
    expect(container.textContent).not.toContain("Local record deleted.");
    const stored = JSON.parse(
      window.localStorage.getItem("wallhaze:history:v1") ?? "[]"
    ) as unknown[];
    expect(stored).toHaveLength(1);
  });

  it("flags unreachable remote images and disables their download", async () => {
    addLocalEntry({ prompt: "Doomed image" });
    const container = renderUI(createElement(MyCreationsClient));
    const image = container.querySelector("img");
    expect(image).not.toBeNull();

    await act(async () => {
      image?.dispatchEvent(new Event("error", { bubbles: true }));
    });

    expect(container.textContent).toContain("Image no longer available");
    const downloadButton = findButton(container, "Download");
    expect(downloadButton?.disabled).toBe(true);
  });

  it("drops non-https (data:) records at load — no image bytes in the DOM", () => {
    const corrupted = {
      id: "leaky-record",
      createdAt: Date.now(),
      prompt: "leaky",
      styleId: null,
      device: "phone",
      imageUrl: "data:image/png;base64,QUJDRA==",
      width: 10,
      height: 10,
      hasReferenceImage: true,
    };
    window.localStorage.setItem(
      "wallhaze:history:v1",
      JSON.stringify([corrupted])
    );
    const container = renderUI(createElement(MyCreationsClient));

    expect(container.querySelectorAll("li")).toHaveLength(0);
    expect(container.textContent).toContain("No creations yet");
    expect(container.innerHTML).not.toContain("data:image");
    expect(container.innerHTML).not.toContain("QUJDRA==");
  });

  it("reports download outcomes honestly — opened is not saved (audit P1)", async () => {
    addLocalEntry({ prompt: "Outcome case" });
    const container = renderUI(createElement(MyCreationsClient));

    vi.mocked(downloadImage).mockResolvedValueOnce("opened");
    await clickButton(findButton(container, "Download") as HTMLButtonElement);
    expect(container.textContent).toContain(
      "Direct download was blocked — the image opened in a new tab, save it from there."
    );
    expect(container.textContent).not.toContain("saved to your downloads");

    vi.mocked(downloadImage).mockResolvedValueOnce("failed");
    await clickButton(findButton(container, "Download") as HTMLButtonElement);
    expect(container.textContent).toContain(
      "Download failed — please check your connection and try again."
    );

    vi.mocked(downloadImage).mockResolvedValueOnce("downloaded");
    await clickButton(findButton(container, "Download") as HTMLButtonElement);
    expect(container.textContent).toContain("Creation saved to your downloads.");
  });

  it("disables the download button while a download is in flight", async () => {
    addLocalEntry({ prompt: "Busy case" });
    const container = renderUI(createElement(MyCreationsClient));

    let resolveDownload: ((value: "downloaded") => void) | undefined;
    vi.mocked(downloadImage).mockReturnValueOnce(
      new Promise<"downloaded">((resolve) => {
        resolveDownload = resolve;
      })
    );

    const downloadButton = findButton(
      container,
      "Download"
    ) as HTMLButtonElement;
    await clickButton(downloadButton);
    expect(downloadButton.disabled).toBe(true);
    expect(container.textContent).toContain("Downloading…");

    await act(async () => {
      resolveDownload?.("downloaded");
    });
    expect(downloadButton.disabled).toBe(false);
    expect(container.textContent).toContain("Creation saved to your downloads.");
  });
});
