import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  body?: string;
  /** Optional leading visual (icon or custom node). */
  icon?: ReactNode;
  /** Optional call-to-action under the copy (e.g. "Clear filters"). */
  action?: ReactNode;
  className?: string;
}

/** Centered empty-state panel: nothing matched, nothing is broken. */
export default function EmptyState({
  title,
  body,
  icon,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-14 text-center ${className}`}
    >
      {icon ? (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {body ? <p className="mt-1 text-xs text-zinc-500">{body}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
