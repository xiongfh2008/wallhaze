"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import Modal from "./ui/Modal";
import ImagePreview from "./ui/ImagePreview";

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
 * Full-size image viewer built on the shared Modal + ImagePreview
 * primitives — no second modal system. The image is rendered with
 * `object-contain` so wallpapers are always shown complete (never cropped),
 * and an in-panel retry appears if the bitmap cannot load. Closing works
 * via the close button, a backdrop click or Escape (handled by Modal).
 *
 * The generator uses the bare image view; the wallpapers browser passes the
 * optional title/meta/description/actions to turn the same dialog into a
 * quick-look preview.
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
  const hasInfo = Boolean(title || meta || description || children);

  return (
    <Modal
      open
      onClose={onClose}
      label={title ?? alt}
      panelClassName="flex w-full max-w-4xl flex-col items-center gap-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t("closeAria")}
        data-autofocus
        className="absolute -top-2 right-0 z-10 flex h-10 w-10 translate-y-[-100%] items-center justify-center rounded-full border border-white/20 bg-black/60 text-zinc-200 outline-none backdrop-blur transition hover:border-white/40 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/70 md:-right-2 md:translate-x-[calc(100%+8px)] md:translate-y-0"
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

      <ImagePreview
        src={src}
        alt={alt}
        gradient={gradient}
        failedTitle={t("imageUnavailable")}
        retryLabel={t("retry")}
        onClick={(event) => event.stopPropagation()}
        className={hasInfo ? "max-h-[55vh] w-full md:max-h-[65vh]" : "max-h-[80vh] w-full"}
      />

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
    </Modal>
  );
}
