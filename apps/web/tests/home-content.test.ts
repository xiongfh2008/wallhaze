import { describe, expect, it } from "vitest";
import { FEATURED_WALLPAPERS, PRESET_WALLPAPERS } from "@/lib/wallpapers";
import {
  DEMO_SAMPLE_IMAGE,
  HERO_IMAGE,
  POPULAR_STYLES,
  WALLPAPER_STYLES,
} from "@/lib/styles";

/**
 * Homepage content invariants:
 * - no artwork repeats between the hero/demo, marquee, featured grid and
 *   style navigation;
 * - the featured grid stays at 8 cleared editorial picks;
 * - review-pending artwork has no public image URL;
 * - the old 39 entries remain review-pending and are never auto-promoted.
 */
const imageOf = (slot: { image?: string | null } | undefined) =>
  slot?.image ?? null;

const usedImages = new Set<string>(
  [
    ...POPULAR_STYLES.map((style) => style.image),
    ...FEATURED_WALLPAPERS.map((wallpaper) => wallpaper.image),
  ].filter((image): image is string => Boolean(image))
);
const marqueeStyles = WALLPAPER_STYLES.filter(
  (style) => style.image && !usedImages.has(style.image)
).slice(0, 8);

const groups: Record<string, Array<string | null>> = {
  hero: [HERO_IMAGE, DEMO_SAMPLE_IMAGE],
  marquee: marqueeStyles.map(imageOf),
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

  it("selects only distinct cleared marquee previews", () => {
    expect(marqueeStyles).toHaveLength(8);
    for (const style of marqueeStyles) {
      expect(style.image).toBeTruthy();
      expect(usedImages.has(style.image as string)).toBe(false);
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
