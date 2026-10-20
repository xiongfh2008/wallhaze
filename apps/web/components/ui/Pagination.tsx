"use client";

import Button from "./Button";

export interface PaginationLabels {
  /** e.g. "Load more wallpapers". */
  loadMore: string;
  /** Live-region progress line, e.g. "Showing {shown} of {total}". */
  showing: string;
  /** End note once everything is visible, e.g. "You've seen all {total}". */
  end: string;
}

interface PaginationProps {
  /** Items currently visible. */
  shown: number;
  /** Items available in total. */
  total: number;
  loading?: boolean;
  labels: PaginationLabels;
  onLoadMore: () => void;
  className?: string;
}

/**
 * Load-more pagination for client-filtered lists (a numbered pager would
 * desync with live filtering). The progress line is a polite live region so
 * screen readers hear the updated count after each expansion.
 */
export default function Pagination({
  shown,
  total,
  loading = false,
  labels,
  onLoadMore,
  className = "",
}: PaginationProps) {
  if (total === 0) return null;

  const hasMore = shown < total;

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <p aria-live="polite" className="text-xs text-zinc-500">
        {hasMore
          ? labels.showing
              .replace("{shown}", String(shown))
              .replace("{total}", String(total))
          : labels.end.replace("{total}", String(total))}
      </p>
      {hasMore ? (
        <Button
          variant="secondary"
          onClick={onLoadMore}
          loading={loading}
        >
          {labels.loadMore}
        </Button>
      ) : null}
    </div>
  );
}
