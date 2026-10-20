"use client";

import type { ReactNode } from "react";
import Button from "./Button";

interface ErrorStateProps {
  title: string;
  body?: string;
  /** When provided (with onRetry) a retry button is rendered. */
  retryLabel?: string;
  onRetry?: () => void;
  /** Replace the default warning icon with custom content. */
  icon?: ReactNode;
  className?: string;
}

/**
 * Error-state panel for recoverable failures (image failed to load, action
 * rejected). Always offers an explicit way forward — retry when possible,
 * never a dead end.
 */
export default function ErrorState({
  title,
  body,
  retryLabel,
  onRetry,
  icon,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-10 text-center ${className}`}
    >
      {icon ?? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="h-8 w-8 text-amber-300"
        >
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z" />
        </svg>
      )}
      <p className="mt-3 text-sm font-medium text-zinc-200">{title}</p>
      {body ? (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
          {body}
        </p>
      ) : null}
      {retryLabel && onRetry ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-5"
          onClick={onRetry}
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
