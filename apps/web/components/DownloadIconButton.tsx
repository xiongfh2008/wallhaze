"use client";

import { DownloadIcon, SpinnerIcon } from "./icons";

interface DownloadIconButtonProps {
  /** Accessible name, e.g. "Download Sakura Nights". */
  label: string;
  /** While true the button is disabled and shows a spinner. */
  busy: boolean;
  onDownload: () => void;
  /** Disabled when the asset has no cleared distribution license. */
  disabled?: boolean;
  /** Position + size classes, e.g. "absolute left-3 top-3 h-9 w-9". */
  className: string;
  /** Glyph size, defaults to "h-4 w-4". */
  iconClassName?: string;
}

/**
 * Round icon-only download button shared by gallery cards and My Library
 * favorites. Visual language matches the favorite hearts; always visible
 * (never hover-only) so it works on touch devices.
 */
export function DownloadIconButton({
  label,
  busy,
  onDownload,
  disabled = false,
  className,
  iconClassName = "h-4 w-4",
}: DownloadIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onDownload}
      disabled={busy || disabled}
      aria-label={label}
      className={`z-10 flex items-center justify-center rounded-full border outline-none backdrop-blur transition focus-visible:ring-2 focus-visible:ring-violet-400/60 disabled:cursor-not-allowed disabled:opacity-40 ${
        busy
          ? "border-violet-400/50 bg-black/60 text-violet-200"
          : "border-white/15 bg-black/50 text-zinc-300 enabled:hover:border-white/40 enabled:hover:text-white"
      } ${className}`}
    >
      {busy ? (
        <SpinnerIcon className={iconClassName} />
      ) : (
        <DownloadIcon className={iconClassName} />
      )}
    </button>
  );
}
