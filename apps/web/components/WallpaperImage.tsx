"use client";

import { useEffect, useRef, useState } from "react";

interface WallpaperImageProps {
  src?: string;
  alt: string;
  /** Gradient rendered when the image is missing or fails to load. */
  gradient: string;
  className?: string;
  eager?: boolean;
  /** Hint the browser to fetch this image first (LCP candidates only). */
  priority?: boolean;
  /** Responsive WebP candidate list (lib/images.ts webpSrcSet). */
  srcSet?: string;
  /** Intrinsic display width hint for the srcSet selection. */
  sizes?: string;
  /** Optional callback fired when the image fails to load. */
  onError?: () => void;
  /** Optional callback fired once the bitmap has loaded. */
  onLoaded?: () => void;
}

/**
 * Remote artwork with graceful degradation: if the image cannot load,
 * a gradient placeholder with the same footprint is rendered instead.
 */
export default function WallpaperImage({
  src,
  alt,
  gradient,
  className = "",
  eager = false,
  priority = false,
  srcSet,
  sizes,
  onError,
  onLoaded,
}: WallpaperImageProps) {
  // Failure state records WHICH src failed: a src change re-derives
  // `failed` (no reset setState needed), so a reused card instance whose
  // previous image failed never hides the next, perfectly valid one.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Whether the bitmap has been observed as decoded. Fires the consumer's
  // onLoaded even when the browser finished loading BEFORE React attached
  // the onLoad handler (SSR hydration after the image completed, HTTP-cache
  // hits, bfcache restores) — otherwise the caller's opacity-0 placeholder
  // would never be cleared and the card would stay a gradient forever.
  const seenLoaded = useRef(false);
  const failed = src != null && failedSrc === src;

  // Settle check in an effect on every src change: an image that already
  // settled (complete=true — hydration race or cache hit) reports
  // success/failure without an event replay.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !src) return;
    if (img.complete) {
      if (img.naturalWidth > 0) {
        if (!seenLoaded.current) {
          seenLoaded.current = true;
          onLoaded?.();
        }
      } else {
        // complete with a zero naturalWidth = the load already failed.
        setFailedSrc(src);
        onError?.();
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reads the settled <img> state to clear the opacity-0 placeholder; failure records the failed src (see failedSrc)
  }, [src, onLoaded, onError]);

  const attachRef = (img: HTMLImageElement | null) => {
    imgRef.current = img;
  };

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`bg-gradient-to-br ${gradient} ${className}`}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote artwork URLs, next/image domain config intentionally avoided
    <img
      ref={attachRef}
      src={src}
      alt={alt}
      // The gradient doubles as an in-loading backdrop: until the bitmap is
      // decoded the box shows the style gradient instead of raw black.
      className={`bg-gradient-to-br ${gradient} ${className}`}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      onLoad={onLoaded}
      onError={() => {
        if (src) setFailedSrc(src);
        onError?.();
      }}
    />
  );
}
