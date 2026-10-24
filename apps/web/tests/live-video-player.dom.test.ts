/**
 * LiveVideoPlayer resilience (jsdom).
 *
 * A rejected play() is common when playback is interrupted (tab hidden,
 * surface capture, user pausing immediately). Only an actual media error may
 * replace the player with "video unavailable" — otherwise a recoverable
 * interruption would permanently destroy a working demo.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next-intl", async () => {
  const { default: en } = await import("../messages/en.json");
  const live = en.liveStudio as unknown as Record<string, string>;
  return {
    useTranslations:
      (namespace: string) =>
      (key: string): string =>
        namespace === "liveStudio"
          ? live[key] ?? `${namespace}.${key}`
          : `${namespace}.${key}`,
  };
});

import LiveVideoPlayer from "@/components/studio/LiveVideoPlayer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPlayer() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(LiveVideoPlayer, {
        src: "/videos/live-demos/neon-rain.mp4",
        poster: "/videos/live-demos/neon-rain.png",
        durationSeconds: 5,
        label: "Neon rain demo",
      })
    );
  });
  return container;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

describe("LiveVideoPlayer", () => {
  it("keeps a working demo after an interrupted play()", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new DOMException("interrupted", "AbortError")
    );
    const element = await renderPlayer();
    const play = element.querySelector<HTMLButtonElement>('button[aria-label="Play video"]');
    expect(play).not.toBeNull();
    await act(async () => {
      play?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(element.textContent).not.toContain("could not be played");
    expect(element.querySelector("video")).not.toBeNull();
    expect(play?.isConnected).toBe(true);
  });

  it("shows the failure notice for a real media error", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new Error("decode")
    );
    const element = await renderPlayer();
    const video = element.querySelector<HTMLVideoElement>("video");
    if (!video) throw new Error("video element missing");
    Object.defineProperty(video, "error", {
      configurable: true,
      value: { code: 4, message: "unsupported" },
    });
    const play = element.querySelector<HTMLButtonElement>('button[aria-label="Play video"]');
    await act(async () => {
      play?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(element.textContent).toContain("could not be played");
    expect(element.querySelector("video")).not.toBeNull();
    expect(element.querySelector("button")).toBeNull();
  });
});
