import { describe, expect, it } from "vitest";
import {
  buildCreateSimilarHref,
  buildStudioRestoreHref,
  hasRestore,
  parseStudioRestore,
} from "@/lib/studio/restore";
import { CREATE_SIMILAR_VARIANTS } from "@/lib/wallpapers";
import { PROMPT_MAX_LENGTH } from "@wallhaze/contracts";

const params = (query: string) => new URLSearchParams(query);

describe("create-similar prompt length budget", () => {
  // Server-side worst-case composition overhead (mirrors prompt-builder.ts):
  // "Scene: <x>." wrapper + the longest device guidance (~175) + frame
  // guidance (~45) + the reference-image guidance (~480), rounded up.
  const COMPOSITION_OVERHEAD_BOUND = 750;
  // Curated template ceiling: keeps at least 350 characters of supplement
  // budget under the 800-char sent-prompt cap.
  const TEMPLATE_MAX_LENGTH = 450;

  it("every whitelisted variant leaves supplement room and fits the final 1600 budget", () => {
    const wallpapers = Object.keys(CREATE_SIMILAR_VARIANTS);
    expect(wallpapers.length).toBeGreaterThanOrEqual(6);
    for (const slug of wallpapers) {
      const variants = CREATE_SIMILAR_VARIANTS[slug];
      expect(variants.length).toBeGreaterThanOrEqual(3);
      const ids = new Set(variants.map((variant) => variant.id));
      expect(ids.size).toBe(variants.length);
      for (const variant of variants) {
        expect(variant.prompt.trim().length).toBeGreaterThan(100);
        // Templates stay within the curated 350-450 band — never truncated.
        expect(variant.prompt.length).toBeLessThanOrEqual(TEMPLATE_MAX_LENGTH);
        expect(variant.prompt.length).toBeGreaterThanOrEqual(350);
        // The UI joins template + supplement with a "\n\n" separator under
        // the 800-char sent-prompt cap, so the real supplement budget is
        // 800 - template - 2 — must stay >= 350 for every variant.
        expect(800 - variant.prompt.length - 2).toBeGreaterThanOrEqual(350);
        // Worst case: max supplement + composition overhead must stay under
        // the server's 1600 final-prompt ceiling — a compliant client can
        // never trigger PROMPT_TOO_LONG.
        expect(PROMPT_MAX_LENGTH + COMPOSITION_OVERHEAD_BOUND).toBeLessThan(
          1600
        );
      }
    }
  });
});

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
      createSimilar: null,
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

describe("structured create-similar handoff (wallpaper + variant ids)", () => {
  it("resolves a whitelisted wallpaper+variant pair to its internal template", () => {
    const request = parseStudioRestore(
      params(
        "wallpaper=room-for-a-happy-dance&variant=faithful&device=desktop&ratio=16%3A9&ref=%2Fimages%2Fwallpapers%2Froom-for-a-happy-dance.png"
      )
    );
    expect(request.createSimilar).not.toBeNull();
    expect(request.createSimilar?.wallpaperId).toBe(
      "room-for-a-happy-dance"
    );
    expect(request.createSimilar?.variantId).toBe("faithful");
    // The internal template is resolved from the whitelist — never the URL.
    expect(request.createSimilar?.prompt.length).toBeGreaterThan(100);
    expect(request.prompt).toBeNull();
    expect(request.ref).toBe(
      "/images/wallpapers/room-for-a-happy-dance.png"
    );
    expect(hasRestore(request)).toBe(true);
  });

  it("resolves every whitelisted wallpaper's faithful variant (variant ids follow the data)", () => {
    for (const slug of [
      "spinning-into-sunshine",
      "room-for-a-happy-dance",
      "one-bright-step",
      "sunny-headphones-smile",
      "seaside-daydream-boy",
      "adventure-goggles-cat",
    ]) {
      const request = parseStudioRestore(
        params(`wallpaper=${slug}&variant=faithful`)
      );
      expect(request.createSimilar?.wallpaperId).toBe(slug);
      expect(request.createSimilar?.prompt).toBeTruthy();
    }
  });

  it("rejects an unknown wallpaper or variant — no generation context at all", () => {
    expect(
      parseStudioRestore(params("wallpaper=not-a-wallpaper&variant=faithful"))
        .createSimilar
    ).toBeNull();
    expect(
      parseStudioRestore(
        params("wallpaper=room-for-a-happy-dance&variant=not-a-variant")
      ).createSimilar
    ).toBeNull();
    expect(
      parseStudioRestore(params("wallpaper=room-for-a-happy-dance"))
        .createSimilar
    ).toBeNull();
    // A rejected pair must not count as a restorable handoff on its own.
    expect(
      hasRestore(parseStudioRestore(params("wallpaper=not-a-wallpaper&variant=faithful")))
    ).toBe(false);
  });

  it("builds a structured href carrying ids + ref but never a prompt", () => {
    const href = buildCreateSimilarHref({
      wallpaperId: "room-for-a-happy-dance",
      variantId: "faithful",
      device: "desktop",
      ratio: "16:9",
      ref: "/images/wallpapers/room-for-a-happy-dance.png",
    });
    expect(href).toContain("wallpaper=room-for-a-happy-dance");
    expect(href).toContain("variant=faithful");
    expect(href).toContain("device=desktop");
    expect(href).toContain("ratio=16%3A9");
    expect(href).toContain("ref=%2Fimages%2Fwallpapers%2Froom-for-a-happy-dance.png");
    // The internal template must never travel in the URL.
    expect(href).not.toContain("prompt=");
    // Round-trips through the parser with the template restored.
    const parsed = parseStudioRestore(
      new URLSearchParams(href!.split("?")[1])
    );
    expect(parsed.createSimilar?.variantId).toBe("faithful");
    expect(parsed.createSimilar?.prompt.length).toBeGreaterThan(100);
  });

  it("refuses hrefs for unknown pairs, bad devices and external refs", () => {
    expect(
      buildCreateSimilarHref({
        wallpaperId: "not-a-wallpaper",
        variantId: "faithful",
        device: "desktop",
        ratio: "16:9",
        ref: "/images/wallpapers/room-for-a-happy-dance.png",
      })
    ).toBeNull();
    expect(
      buildCreateSimilarHref({
        wallpaperId: "room-for-a-happy-dance",
        variantId: "not-a-variant",
        device: "desktop",
        ratio: "16:9",
        ref: "/images/wallpapers/room-for-a-happy-dance.png",
      })
    ).toBeNull();
    expect(
      buildCreateSimilarHref({
        wallpaperId: "room-for-a-happy-dance",
        variantId: "faithful",
        device: "toaster",
        ratio: "16:9",
        ref: "/images/wallpapers/room-for-a-happy-dance.png",
      })
    ).toBeNull();
    // A device/ratio mismatch drops the ratio but keeps the handoff.
    const mismatch = buildCreateSimilarHref({
      wallpaperId: "room-for-a-happy-dance",
      variantId: "faithful",
      device: "phone",
      ratio: "16:9",
      ref: "/images/wallpapers/room-for-a-happy-dance.png",
    });
    expect(mismatch).toBeTruthy();
    expect(mismatch).not.toContain("ratio=");
  });
});
