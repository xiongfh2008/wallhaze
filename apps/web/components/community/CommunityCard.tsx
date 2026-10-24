"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import WallpaperImage from "@/components/WallpaperImage";
import WallpaperDeviceBadge from "@/components/media/WallpaperDeviceBadge";
import { findStyle } from "@/lib/styles";
import { formatAspectRatio } from "@/lib/media";
import type { CommunityWork } from "@/lib/community";

/**
 * Community card. It shows only public preview/poster assets; a view-only
 * work never gets a download URL or a "download" badge.
 */
export default function CommunityCard({
  work,
  priority = false,
}: {
  work: CommunityWork;
  priority?: boolean;
}) {
  const t = useTranslations("community");
  const tStyles = useTranslations("styleLabels");
  const tAll = useTranslations();

  const title = work.titleKey ? tAll(work.titleKey) : work.title;
  const authorName = work.author.nameKey
    ? tAll(work.author.nameKey)
    : work.author.name;
  const preview =
    work.mediaType === "video" ? work.posterAsset : work.previewAsset;
  const gradient = findStyle(work.styleId)?.gradient ?? "from-violet-900 to-black";
  const demo = work.origin === "demo_seed";

  return (
    <Link
      href={`/community/${work.slug}`}
      aria-label={t("cardViewAria", { title })}
      className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] shadow-lg shadow-black/40 outline-none transition hover:border-violet-400/40 focus-visible:ring-2 focus-visible:ring-violet-400/60"
    >
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: String(work.aspectRatio) }}
      >
        {preview ? (
          <WallpaperImage
            src={preview}
            alt={title}
            gradient={gradient}
            eager={priority}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur ${
              demo
                ? "border-amber-300/35 bg-amber-400/15 text-amber-100"
                : "border-emerald-300/35 bg-emerald-400/15 text-emerald-100"
            }`}
          >
            {demo ? t("demoBadge") : t("submissionBadge")}
          </span>
          <span className="rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur">
            {work.mediaType === "video" ? t("liveMedia") : t("staticMedia")}
          </span>
        </div>

        {work.mediaType === "video" ? (
          <>
            <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white backdrop-blur">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
              {work.durationSeconds}s
            </span>
          </>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="truncate text-sm font-semibold text-white md:text-base">
            {title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-zinc-300">
            {t("cardBy", { author: authorName })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-white/10 bg-black/45 px-2 py-0.5 text-[10px] text-zinc-300">
              {tStyles(work.styleId)}
            </span>
            <WallpaperDeviceBadge
              devices={[work.deviceType]}
              ratio={formatAspectRatio(work.width, work.height)}
            />
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                work.allowDownload
                  ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-400/25 bg-amber-500/10 text-amber-200"
              }`}
            >
              {work.allowDownload ? t("cardDownload") : t("cardViewOnly")}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
