"use client";

import { useState } from "react";

/**
 * Copies the public submission address without ever claiming an email was
 * sent. If the clipboard and legacy path both fail, the address remains
 * selectable and the caller shows a failure label.
 */
export default function CopyEmailButton({
  email,
  label,
  copiedLabel,
  failedLabel,
  className = "",
  statusClassName = "",
}: {
  email: string;
  label: string;
  copiedLabel: string;
  failedLabel: string;
  className?: string;
  statusClassName?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(email);
        setState("copied");
        return;
      }
    } catch {
      // fall through to the legacy path
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = email;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      setState(copied ? "copied" : "failed");
    } catch {
      setState("failed");
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void copy()}
        className={
          className ||
          "inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-zinc-100 outline-none transition hover:border-white/30 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-violet-300/80"
        }
      >
        {label}
      </button>
      <span
        role="status"
        aria-live="polite"
        className={`min-h-5 text-xs ${
          state === "failed" ? "text-amber-300" : "text-emerald-300"
        } ${statusClassName}`}
      >
        {state === "copied"
          ? copiedLabel
          : state === "failed"
            ? failedLabel
            : ""}
      </span>
    </span>
  );
}
