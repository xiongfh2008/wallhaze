/**
 * WallpaperImage loading-state regression (jsdom).
 *
 * Covers the gradient-stuck incident: cards keep their image at opacity-0
 * until onLoad fires, but a browser that finished loading the bitmap BEFORE
 * React attached the handler (SSR hydration, HTTP-cache hit) never replays
 * the load event. The component must detect `complete` at mount and flip the
 * consumer's loaded state immediately, reset its failure state on src
 * changes, and swap to the gradient fallback on failures.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import WallpaperImage from "@/components/WallpaperImage";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

/** jsdom <img> never loads on its own — drive the events explicitly. */
function img(): HTMLImageElement | null {
  return container.querySelector("img");
}

function render(props: {
  src?: string;
  gradient?: string;
  onLoaded?: () => void;
  onError?: () => void;
  eager?: boolean;
}) {
  act(() => {
    root.render(
      createElement(WallpaperImage, {
        src: props.src,
        alt: "wallpaper",
        gradient: "from-violet-900 to-fuchsia-900",
        onLoaded: props.onLoaded,
        onError: props.onError,
        eager: props.eager,
      })
    );
  });
}

describe("WallpaperImage loading states", () => {
  it("renders the real img with lazy loading by default", () => {
    render({ src: "/images/wallpapers/color-burst-puppy.jpg" });
    const el = img();
    expect(el).toBeTruthy();
    expect(el!.getAttribute("loading")).toBe("lazy");
    expect(el!.getAttribute("src")).toBe("/images/wallpapers/color-burst-puppy.jpg");
  });

  it("eager images omit lazy loading (above-the-fold)", () => {
    render({ src: "/images/wallpapers/sakura-nights.jpg", eager: true });
    expect(img()!.getAttribute("loading")).toBe("eager");
  });

  it("fires onLoaded immediately when the image is already complete at mount (cache hit / hydration race)", () => {
    // jsdom images start with complete=false; simulate a cache hit by
    // stubbing the properties BEFORE mount through the prototype.
    const completeSpy = vi
      .spyOn(HTMLImageElement.prototype, "complete", "get")
      .mockReturnValue(true);
    const naturalSpy = vi
      .spyOn(HTMLImageElement.prototype, "naturalWidth", "get")
      .mockReturnValue(1080);
    const onLoaded = vi.fn();
    render({ src: "/images/wallpapers/sakura-dream.jpg", onLoaded });
    expect(completeSpy).toHaveBeenCalled();
    expect(onLoaded).toHaveBeenCalledTimes(1); // no event replay needed
  });

  it("does not fire onLoaded for an in-flight image until onLoad fires", () => {
    const onLoaded = vi.fn();
    render({ src: "/images/wallpapers/neon-rain.jpg", onLoaded });
    expect(onLoaded).not.toHaveBeenCalled();
    act(() => {
      img()!.dispatchEvent(new Event("load"));
    });
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it("switches to the gradient fallback on load failure (no infinite skeleton)", () => {
    const onError = vi.fn();
    render({ src: "/images/wallpapers/broken.jpg", onError });
    act(() => {
      img()!.dispatchEvent(new Event("error"));
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(img()).toBeNull(); // img replaced by the gradient div
    expect(container.querySelector('[role="img"]')).toBeTruthy();
  });

  it("detects a failed-complete image at mount (404 already settled)", async () => {
    const completeSpy = vi
      .spyOn(HTMLImageElement.prototype, "complete", "get")
      .mockReturnValue(true);
    const naturalSpy = vi
      .spyOn(HTMLImageElement.prototype, "naturalWidth", "get")
      .mockReturnValue(0);
    const onError = vi.fn();
    render({ src: "/images/wallpapers/missing.jpg", onError });
    expect(completeSpy).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    // The failure state set inside the ref callback flushes on the next tick.
    await act(async () => {});
    expect(img()).toBeNull();
  });

  it("resets the failure state when src changes to a valid image", () => {
    const onError = vi.fn();
    render({ src: "/images/wallpapers/broken.jpg", onError });
    act(() => {
      img()!.dispatchEvent(new Event("error"));
    });
    expect(container.querySelector("img")).toBeNull();

    // Same reused instance: a NEW valid src must render an img again.
    render({ src: "/images/wallpapers/violet-orb.jpg" });
    expect(img()).toBeTruthy();
    expect(img()!.getAttribute("src")).toBe("/images/wallpapers/violet-orb.jpg");
  });

  it("renders the gradient when no src is provided (review-pending)", () => {
    render({ src: undefined });
    expect(img()).toBeNull();
    expect(container.querySelector('[role="img"]')).toBeTruthy();
  });

  it("loads lazily but still detects completion for lazy images at mount", () => {
    // A lazy image restored from cache can be complete at mount too.
    const completeSpy = vi
      .spyOn(HTMLImageElement.prototype, "complete", "get")
      .mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(928);
    const onLoaded = vi.fn();
    render({ src: "/images/wallpapers/sunshine-puppy-portrait.jpg", onLoaded });
    expect(completeSpy).toHaveBeenCalled();
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(img()!.getAttribute("loading")).toBe("lazy");
  });
});
