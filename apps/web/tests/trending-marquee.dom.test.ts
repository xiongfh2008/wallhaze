/**
 * DOM-level tests (jsdom) for the homepage styles auto-carousel
 * (TrendingMarquee). Verifies the shipped structure: hidden scrollbar
 * utilities, three sequences (one real + two decorative clones), clones
 * excluded from the accessibility tree and keyboard order, real cards keep
 * their links and labels, and the reduced-motion fallback re-enables snap.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import TrendingMarquee from "@/components/TrendingMarquee";
import { STYLE_SPOTLIGHT } from "@/lib/wallpapers";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    className,
    tabIndex,
    ariaLabel,
    children,
  }: {
    href: string;
    className?: string;
    tabIndex?: number;
    ariaLabel?: string;
    children?: ReactNode;
  }) =>
    createElement(
      "a",
      { href, className, tabIndex, "aria-label": ariaLabel },
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
  default: ({ src, alt }: { src: string; alt: string }) =>
    createElement("img", { src, alt }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const rendered: Array<{ root: Root; container: HTMLElement }> = [];

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

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
  vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  for (const { root, container } of rendered) {
    act(() => root.unmount());
    container.remove();
  }
  rendered.length = 0;
  vi.unstubAllGlobals();
});

describe("homepage styles auto-carousel", () => {
  it("renders three sequences: one accessible, two decorative clones", () => {
    const container = renderUI(createElement(TrendingMarquee));
    const viewport = container.querySelector<HTMLElement>("div.overflow-x-auto");
    expect(viewport).not.toBeNull();
    const groups = viewport!.children;
    expect(groups.length).toBe(3);
    expect(groups[0].getAttribute("aria-hidden")).toBeNull();
    expect(groups[1]?.getAttribute("aria-hidden")).toBe("true");
    expect(groups[2]?.getAttribute("aria-hidden")).toBe("true");

    const links = Array.from(groups[0].querySelectorAll("a"));
    expect(links.length).toBe(STYLE_SPOTLIGHT.length);
    // Real links are keyboard-reachable and keep their destinations.
    for (const link of links) expect(link.getAttribute("tabindex")).toBeNull();
    expect(links[0].getAttribute("href")).toMatch(/^\/(wallpapers|studio)/);

    // Clone links are removed from the keyboard order.
    const cloneLinks = Array.from(groups[1].querySelectorAll("a"));
    expect(cloneLinks.length).toBe(STYLE_SPOTLIGHT.length);
    for (const link of cloneLinks)
      expect(link.getAttribute("tabindex")).toBe("-1");
  });

  it("hides the scrollbar and never reintroduces page-level overflow", () => {
    const container = renderUI(createElement(TrendingMarquee));
    const viewport = container.querySelector<HTMLElement>("div.overflow-x-auto");
    expect(viewport!.className).toContain("[scrollbar-width:none]");
    expect(viewport!.className).toContain("[&::-webkit-scrollbar]:hidden");
    // The viewport itself is the only scrolling surface: overflow-x-auto,
    // not overflow-visible — the page stays free of horizontal overflow.
    expect(viewport!.className).not.toContain("overflow-visible");
    // No body-level overflow hiding is used anywhere in this component.
    expect(container.querySelector("style")).toBeNull();
  });

  it("defaults to the animated layout (no snap) and flips to the snap fallback only under reduced motion", () => {
    const container = renderUI(createElement(TrendingMarquee));
    const viewport = container.querySelector<HTMLElement>("div.overflow-x-auto");
    // Animated mode: no mandatory snapping (it would fight the motion).
    expect(viewport!.className).not.toContain("snap-x");

    // Reduced motion: the same markup gains the native snap-scroll fallback.
    (globalThis.matchMedia as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const reduced = renderUI(createElement(TrendingMarquee));
    const reducedViewport = reduced.querySelector<HTMLElement>(
      "div.overflow-x-auto"
    );
    expect(reducedViewport!.className).toContain("snap-x");
    expect(reducedViewport!.className).toContain("snap-mandatory");
    // Still no scrollbar and still three sequences.
    expect(reducedViewport!.className).toContain("[scrollbar-width:none]");
    expect(reducedViewport!.children.length).toBe(3);
  });

  it("advances at the constant speed and rewinds by exactly one sequence period", () => {
    // Drive the rAF loop manually: capture the callback, give the groups a
    // measured layout (period = 1000px between consecutive sequences), and
    // a writable scrollLeft on the viewport.
    let rafCallback: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", vi.fn((cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    }));
    const container = renderUI(createElement(TrendingMarquee));
    const viewport = container.querySelector<HTMLElement>("div.overflow-x-auto")!;
    const groups = Array.from(viewport.children) as HTMLElement[];
    let left = 0;
    groups.forEach((group, index) => {
      Object.defineProperty(group, "offsetLeft", {
        configurable: true,
        get: () => index * 1000,
      });
    });
    Object.defineProperty(viewport, "scrollLeft", {
      configurable: true,
      get: () => left,
      set: (value: number) => {
        left = value;
      },
    });

    const tick = rafCallback as unknown as FrameRequestCallback;
    // Drive realistic 60 fps frames (the loop clamps >100 ms deltas).
    let clock = 0;
    const advance = (ms: number) => {
      const frames = Math.round(ms / 16.67);
      for (let index = 0; index < frames; index += 1) {
        clock += 16.67;
        act(() => tick(clock));
      }
    };

    advance(1000); // one second of frames
    // 38 px/s ±1 px (whole-frame quantization).
    expect(left).toBeGreaterThan(37);
    expect(left).toBeLessThan(39);
    advance(1000);
    expect(left).toBeGreaterThan(75);
    expect(left).toBeLessThan(77);

    // Crossing the period rewinds invisibly. Simulate a user drag that
    // left the rail just before the seam (the interaction syncs the loop's
    // position from the DOM, exactly like a real drag), then autoplay
    // crosses the 1000 px period.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      left = 999;
      act(() => {
        viewport.dispatchEvent(new MouseEvent("pointerdown"));
      });
      act(() => {
        window.dispatchEvent(new MouseEvent("pointerup"));
      });
      act(() => {
        vi.advanceTimersByTime(1300); // resume grace period over
      });
      advance(100); // +3.8 px crosses the 1000 px period
      expect(left).toBeLessThan(10);
      expect(left).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("suspends playback while hovering, hidden, or interacting", () => {
    let rafCallback: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", vi.fn((cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    }));
    const container = renderUI(createElement(TrendingMarquee));
    const viewport = container.querySelector<HTMLElement>("div.overflow-x-auto")!;
    const groups = Array.from(viewport.children) as HTMLElement[];
    let left = 0;
    groups.forEach((group, index) => {
      Object.defineProperty(group, "offsetLeft", {
        configurable: true,
        get: () => index * 1000,
      });
    });
    Object.defineProperty(viewport, "scrollLeft", {
      configurable: true,
      get: () => left,
      set: (value: number) => {
        left = value;
      },
    });
    const tick = rafCallback as unknown as FrameRequestCallback;
    let clock = 0;
    const advance = (ms: number) => {
      const frames = Math.round(ms / 16.67);
      for (let index = 0; index < frames; index += 1) {
        clock += 16.67;
        act(() => tick(clock));
      }
    };

    advance(1000);
    expect(left).toBeGreaterThan(37);
    expect(left).toBeLessThan(39);

    // Hover suspends.
    act(() => {
      viewport.dispatchEvent(new MouseEvent("mouseenter"));
    });
    const hoverStart = left;
    advance(1000);
    expect(left).toBe(hoverStart);
    act(() => {
      viewport.dispatchEvent(new MouseEvent("mouseleave"));
    });
    const resumeFrom = left;
    advance(1000);
    // Resumed: roughly one more second of travel from where it stopped.
    expect(left).toBeGreaterThan(resumeFrom + 36);
    expect(left).toBeLessThan(resumeFrom + 40);

    // Pointer interaction suspends; release resumes after the grace period
    // (a real setTimeout — faked here so the test can cross it instantly).
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      act(() => {
        viewport.dispatchEvent(new MouseEvent("pointerdown"));
      });
      act(() => {
        window.dispatchEvent(new MouseEvent("pointerup"));
      });
      const resumeStart = left;
      advance(200); // inside the 1200 ms grace period
      expect(left).toBe(resumeStart); // still suspended
      act(() => {
        vi.advanceTimersByTime(1300); // grace period over
      });
      advance(500); // past the grace period
      expect(left).toBeGreaterThan(resumeStart + 15);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never starts under prefers-reduced-motion", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const raf = vi.fn().mockReturnValue(1);
    vi.stubGlobal("requestAnimationFrame", raf);
    const container = renderUI(createElement(TrendingMarquee));
    // The hydration-safe initial mount starts the loop once, then the
    // mounted matchMedia check flips reduced-motion and tears it down.
    await act(async () => {});
    expect(raf).toHaveBeenCalledTimes(1);
    expect(
      (globalThis.cancelAnimationFrame as unknown as ReturnType<typeof vi.fn>)
    ).toHaveBeenCalledWith(1);
    container.remove();
  });

  it("cleans up listeners and the animation frame on unmount", () => {
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(7));
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const container = renderUI(createElement(TrendingMarquee));
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const unmount = rendered[rendered.length - 1];
    act(() => unmount.root.unmount());
    expect(cancel).toHaveBeenCalledWith(7);
    expect(removeSpy).toHaveBeenCalled();
    container.remove();
  });
});
