import { describe, expect, it } from "vitest";
import { webpSrcSet } from "@/lib/images";
import { IMAGE_VARIANTS } from "@/lib/image-variants.generated";
import { HERO_IMAGE } from "@/lib/styles";

/**
 * The generated manifest must only ever produce srcset candidates that map
 * to real files (a missing candidate would 404 in the browser), and the
 * hero must ship responsive variants so phones never pull the desktop
 * original.
 */
describe("webpSrcSet", () => {
  it("builds width-labelled candidates from the generated manifest", () => {
    const srcSet = webpSrcSet(HERO_IMAGE);
    expect(srcSet).toBeDefined();
    const widths = IMAGE_VARIANTS[HERO_IMAGE]!.widths;
    for (const width of widths) {
      expect(srcSet).toContain(`-${width}.webp ${width}w`);
    }
    // No duplicate candidate for the natural width: the WebP variant covers it.
    expect(srcSet).not.toContain(`${HERO_IMAGE} `);
  });

  it("appends the original as the widest candidate when no variant covers it", () => {
    const entry = Object.entries(IMAGE_VARIANTS).find(
      ([, value]) => !value.widths.includes(value.natural)
    );
    expect(entry).toBeDefined();
    const [src, value] = entry as [string, { widths: number[]; natural: number }];
    expect(webpSrcSet(src)).toContain(`${src} ${value.natural}w`);
  });

  it("returns undefined for sources without generated variants", () => {
    expect(webpSrcSet("/images/not-generated.jpg")).toBeUndefined();
  });

  it("every manifest variant width maps to a real file name pattern", () => {
    for (const [src, value] of Object.entries(IMAGE_VARIANTS)) {
      expect(value.widths.length).toBeGreaterThan(0);
      for (const width of value.widths) {
        expect(width).toBeLessThanOrEqual(value.natural);
        const variant = src.replace(/\.(jpe?g|png|webp)$/i, `-${width}.webp`);
        expect(variant).toMatch(/-\d+\.webp$/);
      }
    }
  });
});
