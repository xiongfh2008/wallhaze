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
      ref: null, // "create similar" ref travels as a separate param
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

describe("create-similar reference handoff", () => {
  it("accepts a same-origin /images/wallpapers/ reference path", () => {
    const request = parseStudioRestore(
      params("style=shoujo&ref=%2Fimages%2Fwallpapers%2Fsunny-headphones-smile.jpg")
    );
    expect(request.ref).toBe("/images/wallpapers/sunny-headphones-smile.jpg");
    expect(request.styleId).toBe("shoujo");
    expect(hasRestore(request)).toBe(true);
  });

  it("drops arbitrary external ref URLs (same-origin only)", () => {
    const request = parseStudioRestore(
      params("ref=https%3A%2F%2Fevil.example%2Fspy.jpg")
    );
    expect(request.ref).toBeNull();
    expect(hasRestore(request)).toBe(false);
  });

  it("drops non-wallpaper internal paths", () => {
    const request = parseStudioRestore(params("ref=%2Fadmin%2Fsecret"));
    expect(request.ref).toBeNull();
  });

  it("builds a create-similar studio href with prompt, style and ref", () => {
    const href = buildStudioRestoreHref({
      prompt: "vibrant expressive sketch illustration of a joyful young woman",
      styleId: "shoujo",
      device: "phone",
      ratio: "9:16",
      ref: "/images/wallpapers/sunny-headphones-smile.jpg",
    });
    expect(href).toContain("/studio?");
    expect(href).toContain("prompt=");
    expect(href).toContain("style=shoujo");
    expect(href).toContain("ref=%2Fimages%2Fwallpapers%2Fsunny-headphones-smile.jpg");
  });
});
