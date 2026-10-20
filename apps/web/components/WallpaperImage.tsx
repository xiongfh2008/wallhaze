"use client";

import { useState } from "react";

interface WallpaperImageProps {
  src?: string;
  alt: string;
  /** Gradient rendered when the image is missing or fails to load. */
  gradient: string;
  className?: string;
  eager?: boolean;
  /** Hint the browser to fetch this image first (LCP candidates only). */
  priority?: boolean;
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
  onError,
  onLoaded,
}: WallpaperImageProps) {
  const [failed, setFailed] = useState(false);

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
      src={src}
      alt={alt}
      // The gradient doubles as an in-loading backdrop: until the bitmap is
      // decoded the box shows the style gradient instead of raw black.
      className={`bg-gradient-to-br ${gradient} ${className}`}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      onLoad={onLoaded}
      onError={() => {
        setFailed(true);
        onError?.();
      }}
    />
  );
}
