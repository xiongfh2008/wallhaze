import { IMAGE_VARIANTS } from "./image-variants.generated";

/**
 * Responsive WebP variants for gallery artwork.
 *
 * scripts/media/build-derivatives.mjs generates `-<WIDTH>.webp` files next
 * to each optimizable source and records them in image-variants.generated.ts,
 * so every srcset candidate here is guaranteed to exist on disk (a missing
 * candidate would 404 at the browser). Originals are untouched: they stay the
 * <img src> fallback, the download assets and the detail-page artwork.
 */
export function webpSrcSet(src: string): string | undefined {
  const entry = IMAGE_VARIANTS[src];
  if (!entry) return undefined;
  const candidates = entry.widths.map(
    (width) => `${variantUrl(src, width)} ${width}w`
  );
  // The source itself is the widest candidate — unless a WebP variant already
  // covers its natural width (then the variant wins: same box, fewer bytes).
  if (!entry.widths.includes(entry.natural)) {
    candidates.push(`${src} ${entry.natural}w`);
  }
  return candidates.join(", ");
}

function variantUrl(src: string, width: number): string {
  return src.replace(/\.(jpe?g|png|webp)$/i, `-${width}.webp`);
}
