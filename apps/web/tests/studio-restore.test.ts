import { describe, expect, it } from "vitest";
import {
  buildStudioRestoreHref,
  hasRestore,
  parseStudioRestore,
} from "@/lib/studio/restore";

const params = (query: string) => new URLSearchParams(query);

describe("studio restore parameters", () => {
  it("parses a complete valid handoff", () => {
    const request = parseStudioRestore(
      params("prompt=a+quiet+forest&style=minimalist&device=phone&ratio=9%3A16&preset=phone-1080x1920")
    );
    expect(request).toEqual({
      prompt: "a quiet forest",
      styleId: "minimalist",
      device: "phone",
      ratio: "9:16",
      presetId: "phone-1080x1920",
    });
    expect(hasRestore(request)).toBe(true);
  });

  it("drops unknown values and ratios the device cannot use", () => {
    const request = parseStudioRestore(
      params("prompt=+++&style=not-a-style&device=phone&ratio=16%3A9&preset=nope")
    );
    expect(request.prompt).toBeNull();
    expect(request.styleId).toBeNull();
    expect(request.device).toBe("phone");
    // 16:9 is not offered for phones — dropped instead of forced.
    expect(request.ratio).toBeNull();
    expect(request.presetId).toBeNull();
    expect(hasRestore(request)).toBe(true);
  });

  it("reports no restore when nothing valid is present and caps the prompt", () => {
    expect(hasRestore(parseStudioRestore(params("")))).toBe(false);
    const long = "x".repeat(2000);
    expect(parseStudioRestore(params(`prompt=${long}`)).prompt?.length).toBe(800);
  });

  it("builds an href carrying only validated settings", () => {
    const href = buildStudioRestoreHref({
      prompt: "neon city",
      styleId: "cyberpunk",
      device: "desktop",
      ratio: "16:9",
      sizePresetId: "desktop-2560x1440",
    });
    expect(href.startsWith("/studio?")).toBe(true);
    const parsed = parseStudioRestore(new URLSearchParams(href.split("?")[1]));
    expect(parsed).toMatchObject({
      prompt: "neon city",
      styleId: "cyberpunk",
      device: "desktop",
      ratio: "16:9",
    });

    // A device/ratio mismatch never leaks into the link.
    const mismatch = buildStudioRestoreHref({
      prompt: "",
      styleId: null,
      device: "phone",
      ratio: "16:9",
      sizePresetId: null,
    });
    expect(mismatch).toBe("/studio?device=phone");
  });
});
