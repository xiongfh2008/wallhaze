interface SkeletonProps {
  className?: string;
}

/**
 * Neutral shimmer block used as an image-loading placeholder. Decorative by
 * design (aria-hidden) — real content is announced by the surrounding
 * component, never by the skeleton itself.
 */
export default function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-xl bg-white/10 ${className}`}
    />
  );
}
