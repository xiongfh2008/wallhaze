"use client";

import { useState } from "react";
import ErrorState from "./ErrorState";

interface ImagePreviewProps {
  /** Full image URL. */
  src: string;
  alt: string;
  /** Gradient shown behind the image while it loads. */
  gradient: string;
  /** Shown when the image cannot be loaded. */
  failedTitle: string;
  /** Label for the retry button. */
  retryLabel: string;
  /** Height constraint classes, e.g. "max-h-[60vh]". */
  className?: string;
  eager?: boolean;
  onClick?: (event: React.MouseEvent<HTMLImageElement>) => void;
}

/**
 * Full-size wallpaper preview: object-contain (never cropped), gradient
 * backdrop while loading, and an explicit retry path when the bitmap
 * cannot be fetched. Remounting the <img> via a key bump re-attempts
 * the load without reloading the page.
 */
export default function ImagePreview({
  src,
  alt,
  gradient,
  failedTitle,
  retryLabel,
  className = "",
  eager = true,
  onClick,
}: ImagePreviewProps) {
  const [failed, setFailed] = useState(false);
  // Incremented on retry — a fresh key remounts the element so the browser
  // re-issues the request even after a hard failure.
  const [attempt, setAttempt] = useState(0);

  if (failed) {
    return (
      <ErrorState
        title={failedTitle}
        retryLabel={retryLabel}
        onRetry={() => {
          setFailed(false);
          setAttempt((value) => value + 1);
        }}
        className="w-full max-w-md"
      />
    );
  }

  return (
    <div
      key={attempt}
      className={`flex items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br ${gradient} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- remote artwork URL, next/image domain config intentionally avoided */}
      <img
        src={src}
        alt={alt}
        onClick={onClick}
        onError={() => setFailed(true)}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}
