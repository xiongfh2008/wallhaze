"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import WallpaperImage from "../WallpaperImage";
import Skeleton from "./Skeleton";
import { HeartIcon } from "../icons";
import { DownloadIconButton } from "../DownloadIconButton";
import WallpaperDeviceBadge from "../media/WallpaperDeviceBadge";
import type { DeviceCategory } from "@/lib/media";

interface ImageCardProps {
  /** Detail-page destination for the card's main link. */
  href: string;
  /** Publicly displayable image URL; absent while rights review is pending. */
  image?: string;
  gradient: string;
  /** Shown instead of the artwork when no cleared image is available. */
  reviewLabel?: string;
  alt: string;
  title: string;
  styleLabel: string;
  /** Accessible name of the main link, e.g. "View Sakura Nights". */
  viewLabel: string;
  /** Accessible name of the download control. */
  downloadLabel: string;
  downloading?: boolean;
  onDownload?: () => void;
  /** Accessible names for the favorite toggle (off/on states). */
  favoriteLabel?: string;
  unfavoriteLabel?: string;
  favorited?: boolean;
  onToggleFavorite?: () => void;
  /** Fixed aspect box class — defaults to the portrait gallery ratio. */
  aspectClassName?: string;
  /** Actual width / height ratio; overrides the fixed aspect class when set. */
  aspectRatio?: number;
  /** Native device class derived from actual pixels (not a claim beyond it). */
  devices?: readonly DeviceCategory[];
  ratioLabel?: string;
  width?: number;
  height?: number;
  /** Above-the-fold images skip lazy loading (first cards only). */
  priority?: boolean;
}

/**
 * Reusable wallpaper card for gallery grids: fixed-aspect image (no layout
 * shift), skeleton backdrop until the bitmap decodes, gradient scrim, and
 * sibling action controls (download / favorite) that never nest inside the
 * main link — so their clicks can never trigger navigation.
 */
export default function ImageCard({
  href,
  image,
  gradient,
  reviewLabel,
  alt,
  title,
  styleLabel,
  viewLabel,
  downloadLabel,
  downloading = false,
  onDownload,
  favoriteLabel,
  unfavoriteLabel,
  favorited = false,
  onToggleFavorite,
  aspectClassName = "aspect-[3/4]",
  aspectRatio,
  devices,
  ratioLabel,
  width,
  height,
  priority = false,
}: ImageCardProps) {
  const tGallery = useTranslations("gallery");
  // The gradient doubles as the loading backdrop; the skeleton adds the
  // shimmer until onLoad fires (or the gradient takes over on failure).
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 shadow-lg shadow-black/40 transition hover:border-violet-400/40 focus-within:ring-2 focus-within:ring-violet-400/60">
      <Link
        href={href}
        aria-label={viewLabel}
        className="block w-full outline-none"
      >
        <div
          className={`relative w-full overflow-hidden ${
            aspectRatio ? "" : aspectClassName
          }`}
          style={aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined}
        >
          {image ? (
            <>
              {!loaded && (
                <Skeleton className={`absolute inset-0 rounded-none bg-gradient-to-br ${gradient}`} />
              )}
              <WallpaperImage
                src={image}
                alt={alt}
                gradient={gradient}
                eager={priority}
                className={`h-full w-full object-cover transition duration-700 group-hover:scale-[1.06] ${
                  loaded ? "opacity-100" : "opacity-0"
                }`}
                onLoaded={() => setLoaded(true)}
              />
            </>
          ) : (
            <>
              <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
              {reviewLabel ? (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <span className="rounded-full border border-amber-300/30 bg-black/55 px-3 py-1.5 text-center text-[11px] font-medium leading-snug text-amber-100 backdrop-blur">
                    {reviewLabel}
                  </span>
                </div>
              ) : null}
            </>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="truncate text-sm font-semibold text-white md:text-base">
            {title}
          </h3>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-zinc-400">{styleLabel}</p>
            <span
              aria-hidden
              className="shrink-0 text-xs font-medium text-violet-300 opacity-0 transition duration-300 group-hover:opacity-100"
            >
              {tGallery("viewDetail")}
            </span>
          </div>
          {devices && ratioLabel ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-white/10 bg-black/45 px-2 py-0.5 text-[10px] text-zinc-400">
                {tGallery("staticMedia")}
              </span>
              <WallpaperDeviceBadge
                devices={devices}
                ratio={ratioLabel}
                width={width}
                height={height}
              />
            </div>
          ) : null}
        </div>
      </Link>

      {onDownload ? (
        <DownloadIconButton
          busy={downloading}
          label={downloadLabel}
          className="absolute left-3 top-3 h-9 w-9"
          onDownload={onDownload}
        />
      ) : null}

      {onToggleFavorite ? (
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={favorited}
          aria-label={favorited ? unfavoriteLabel : favoriteLabel}
          className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border outline-none backdrop-blur transition focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
            favorited
              ? "border-fuchsia-400/60 bg-fuchsia-500/25 text-fuchsia-300"
              : "border-white/15 bg-black/50 text-zinc-300 hover:border-white/40 hover:text-white"
          }`}
        >
          <HeartIcon filled={favorited} className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
