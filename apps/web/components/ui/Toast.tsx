"use client";

import { useEffect } from "react";

export type ToastTone = "success" | "warning" | "error";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastStackProps {
  toasts: readonly ToastItem[];
  onDismiss: (id: number) => void;
  /** Accessible name for the close button, e.g. "Dismiss notification". */
  dismissLabel: string;
  /** Auto-dismiss delay in ms; 0 disables it. */
  durationMs?: number;
  className?: string;
}

const TONE_CLASSES: Record<ToastTone, string> = {
  success: "border-emerald-400/30 bg-emerald-950/60 text-emerald-100",
  warning: "border-amber-400/30 bg-amber-950/60 text-amber-100",
  error: "border-red-400/30 bg-red-950/60 text-red-100",
};

/**
 * Lightweight toast stack for action feedback (downloads, favorites,
 * failures). Success toasts announce politely, warnings/errors assertively.
 * Toasts auto-dismiss and can be closed manually.
 */
export default function ToastStack({
  toasts,
  onDismiss,
  dismissLabel,
  durationMs = 5_000,
  className = "",
}: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          toast={toast}
          dismissLabel={dismissLabel}
          durationMs={durationMs}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

function Toast({
  toast,
  dismissLabel,
  durationMs,
  onDismiss,
}: {
  toast: ToastItem;
  dismissLabel: string;
  durationMs: number;
  onDismiss: (id: number) => void;
}) {
  // Auto-dismiss via a timer owned by the toast itself — one expiring toast
  // never cancels the timers of its siblings.
  useEffect(() => {
    if (durationMs <= 0) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), durationMs);
    return () => window.clearTimeout(timer);
  }, [toast.id, durationMs, onDismiss]);

  return (
    <div
      role={toast.tone === "success" ? "status" : "alert"}
      className={`animate-rise-in flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg shadow-black/40 backdrop-blur ${TONE_CLASSES[toast.tone]}`}
    >
      <p className="leading-relaxed">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={dismissLabel}
        className="shrink-0 rounded-full p-1 opacity-70 outline-none transition hover:opacity-100 focus-visible:ring-2 focus-visible:ring-white/50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="h-3.5 w-3.5"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
