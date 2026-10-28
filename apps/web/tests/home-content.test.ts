import { describe, expect, it } from "vitest";
import {
  FEATURED_WALLPAPERS,
  PRESET_WALLPAPERS,
  STYLE_SPOTLIGHT,
} from "@/lib/wallpapers";
import {
  DEMO_SAMPLE_IMAGE,
  HERO_IMAGE,
  POPULAR_STYLES,
} from "@/lib/styles";

/**
 * Homepage content invariants:
 * - no artwork repeats between the hero/demo, style spotlight rail, featured
 *   grid and style navigation;
 * - the featured grid stays at 8 cleared editorial picks;
 * - the spotlight rail stays at 8 distinct editorial style previews whose
 *   card image matches the linked wallpaper page;
 * - review-pending artwork has no public image URL;
 * - the old 39 entries remain review-pending and are never auto-promoted.
 */
const imageOf = (slot: { image?: string | null } | undefined) =>
  slot?.image ?? null;

const groups: Record<string, Array<string | null>> = {
  hero: [HERO_IMAGE, DEMO_SAMPLE_IMAGE],
  spotlight: STYLE_SPOTLIGHT.map((item) => item.style.image ?? null),
  featured: FEATURED_WALLPAPERS.map(imageOf),
  styles: POPULAR_STYLES.map(imageOf),
};

describe("homepage content de-duplication", () => {
  it("keeps the featured grid at eight cleared editorial picks", () => {
    expect(FEATURED_WALLPAPERS).toHaveLength(8);
    expect(new Set(FEATURED_WALLPAPERS.map((w) => w.image)).size).toBe(8);
    expect(FEATURED_WALLPAPERS.every((w) => w.canPubliclyDisplay)).toBe(true);
    expect(
      FEATURED_WALLPAPERS.every((w) => w.license !== "review-pending")
    ).toBe(true);
    expect(
      FEATURED_WALLPAPERS.every((w) => !w.image?.startsWith("http"))
    ).toBe(true);
  });

  it("does not repeat an image between adjacent homepage sections", () => {
    const names = Object.keys(groups);
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const left = new Set(groups[names[i]]);
        const shared = groups[names[j]].filter(
          (image) => image !== null && left.has(image)
        );
        expect(shared, `${names[i]} vs ${names[j]}`).toEqual([]);
      }
    }
  });

  it("selects eight distinct editorial style previews with valid targets", () => {
    expect(STYLE_SPOTLIGHT).toHaveLength(8);
    const images = STYLE_SPOTLIGHT.map((item) => item.style.image);
    expect(new Set(images).size).toBe(8);
    for (const item of STYLE_SPOTLIGHT) {
      expect(item.style.image).toBeTruthy();
      if (item.wallpaper) {
        // The card links to a cleared preset page showing the same artwork.
        expect(item.wallpaper.canPubliclyDisplay).toBe(true);
        expect(item.wallpaper.styleId).toBe(item.style.id);
        expect(item.wallpaper.image).toBe(item.style.image);
      }
    }
  });

  it("keeps legacy artwork review-pending and documents every licensed addition", () => {
    expect(PRESET_WALLPAPERS).toHaveLength(57);
    const reviewPending = PRESET_WALLPAPERS.filter(
      (w) => w.license === "review-pending"
    );
    const verified = PRESET_WALLPAPERS.filter((w) => w.license === "verified");
    const selfAuthored = PRESET_WALLPAPERS.filter(
      (w) => w.license === "self-authored"
    );
    expect(reviewPending).toHaveLength(39);
    expect(verified).toHaveLength(16);
    expect(selfAuthored).toHaveLength(2);
    expect(verified.every((w) => Boolean(w.source))).toBe(true);
    expect(reviewPending.every((w) => w.image === null)).toBe(true);
    expect(reviewPending.every((w) => w.canPubliclyDisplay === false)).toBe(true);
    expect(reviewPending.every((w) => w.canOfferDownload === false)).toBe(true);
  });
});
