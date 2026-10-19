"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

interface LightboxProps {
  /** Full image URL to display. */
  src: string;
  alt: string;
  /** Gradient used as the fallback when the image cannot load. */
  gradient: string;
  onClose: () => void;
  /** Optional heading, e.g. the wallpaper title (gallery detail view). */
  title?: string;
  /** Optional one-line meta, e.g. "Digital Art · Sci-Fi · Curated demo". */
  meta?: string;
  /** Optional longer description shown under the meta line. */
  description?: string;
  /** Optional action row (favorite / create-similar) under the info block. */
  children?: ReactNode;
}

/**
 * Minimal full-size image preview — no third-party dependencies.
 *
 * The image is rendered with `object-contain` so wallpapers are always
 * shown complete (never cropped to a device frame), scaled to fit both
 * desktop and mobile viewports. Closes via the close button, a click on
 * the backdrop, or the Escape key. Opening/closing is purely display
 * state — it never touches the generator's form or triggers a request.
 *
 * The generator uses the bare image view; the gallery passes the optional
 * title/meta/description/actions to turn the same dialog into a wallpaper
 * detail view (single implementation, no second modal system).
 */
export default function Lightbox({
  src,
  alt,
  gradient,
  onClose,
  title,
  meta,
  description,
  children,
}: LightboxProps) {
  const t = useTranslations("lightbox");
  const [failed, setFailed] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const hasInfo = Boolean(title || meta || description || children);

  // Scroll lock, initial focus and Escape handling live here so the parent
  // stays display-only. No setState inside the effect — the failed flag is
  // managed by the img's onError handler below.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? alt}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-black/90 p-4 backdrop-blur-sm md:p-8"
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        aria-label={t("closeAria")}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/60 text-zinc-200 outline-none backdrop-blur transition hover:border-white/40 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/70"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="h-5 w-5"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {failed ? (
        <div
          className={`flex items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} ${
            hasInfo ? "h-52 w-full max-w-md" : "h-64 w-full max-w-md"
          }`}
        >
          <p className="px-6 text-center text-sm leading-relaxed text-zinc-200">
            {t("imageUnavailable")}
          </p>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- remote artwork URL, next/image domain config intentionally avoided
        <img
          src={src}
          alt={alt}
          onClick={(event) => event.stopPropagation()}
          onError={() => setFailed(true)}
          loading="eager"
          decoding="async"
          // With an info block the image yields vertical space so title,
          // description and actions stay reachable on small screens.
          className={`max-w-full rounded-lg object-contain shadow-2xl shadow-black/60 ${
            hasInfo ? "max-h-[55vh] md:max-h-[65vh]" : "max-h-full"
          }`}
        />
      )}

      {hasInfo && (
        <div className="max-w-md text-center">
          {title && (
            <h2 className="text-lg font-semibold tracking-tight text-white">
              {title}
            </h2>
          )}
          {meta && (
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-violet-300">
              {meta}
            </p>
          )}
          {description && (
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              {description}
            </p>
          )}
          {children && (
            <div
              onClick={(event) => event.stopPropagation()}
              className="mt-4 flex flex-wrap items-center justify-center gap-2"
            >
              {children}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-zinc-500">
        {t("hint")}
        <span className="hidden md:inline">{t("hintDesktop")}</span>
      </p>
    </div>
  );
}
