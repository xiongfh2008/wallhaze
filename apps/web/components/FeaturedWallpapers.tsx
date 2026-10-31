import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FEATURED_WALLPAPERS, type PresetWallpaper } from "@/lib/wallpapers";
import { webpSrcSet } from "@/lib/images";
import WallpaperImage from "./WallpaperImage";
import WallpaperDeviceBadge from "./media/WallpaperDeviceBadge";
import { formatAspectRatio } from "@/lib/media";

interface WallpaperLinkCardProps {
  wallpaper: PresetWallpaper;
  /** Localized title. */
  title: string;
  /** Localized alt text. */
  alt: string;
  styleLabel: string;
  /** Accessible link name. */
  viewLabel: string;
  /** Shown when the artwork is withheld during rights review. */
  reviewLabel?: string;
  /** Above-the-fold images skip lazy loading. */
  priority?: boolean;
}

/**
 * Server-rendered wallpaper tile that links to its detail page — zero
 * client JS. Used by the homepage featured section and the detail page's
 * related strip; interactive variants (download/favorite) live in the
 * gallery browser instead.
 */
export function WallpaperLinkCard({
  wallpaper,
  title,
  alt,
  styleLabel,
  viewLabel,
  reviewLabel,
  priority = false,
}: WallpaperLinkCardProps) {
  return (
    <Link
      href={`/wallpapers/${wallpaper.id}`}
      aria-label={viewLabel}
      className="group relative block overflow-hidden rounded-2xl border border-white/10 shadow-lg shadow-black/40 outline-none transition hover:border-violet-400/40 focus-visible:ring-2 focus-visible:ring-violet-400/60"
    >
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: String(wallpaper.aspectRatio) }}
      >
        {wallpaper.image ? (
          <WallpaperImage
            src={wallpaper.image}
            alt={alt}
            gradient={wallpaper.gradient}
            eager={priority}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]"
          />
        ) : (
          <>
            <div
              className={`absolute inset-0 bg-gradient-to-br ${wallpaper.gradient}`}
            />
            {reviewLabel ? (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <span className="rounded-full border border-amber-300/30 bg-black/55 px-3 py-1.5 text-center text-[11px] font-medium leading-snug text-amber-100 backdrop-blur">
                  {reviewLabel}
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white md:text-base">
            {title}
          </h3>
          <p className="truncate text-xs text-zinc-400">{styleLabel}</p>
          <WallpaperDeviceBadge
            devices={wallpaper.nativeDevices}
            ratio={formatAspectRatio(wallpaper.width, wallpaper.height)}
            className="mt-1.5"
          />
        </div>
        <span
          aria-hidden
          className="shrink-0 text-xs font-medium text-violet-300 opacity-0 transition duration-300 group-hover:opacity-100"
        >
          &rarr;
        </span>
      </div>
    </Link>
  );
}

/**
 * Homepage "Featured Wallpapers" (2026-10-31 redesign): a clean, uniform
 * 16:9 card grid — 3 columns on desktop (max-width 1280px), 2 on tablet,
 * 1 on mobile. Every featured piece is a desktop-ratio original; images are
 * cropped with object-cover (never stretched), carry a light bottom scrim,
 * a concise title + style label and a subtle hover zoom. Zero mixed-ratio
 * holes. Server-rendered; cards link to detail pages where download lives.
 */
export default function FeaturedWallpapers() {
  const t = useTranslations("featured");
  const tWallpapers = useTranslations("galleryWallpapers");
  const tStyles = useTranslations("styleLabels");

  return (
    <section id="featured" className="relative py-16 md:py-20">
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="mb-8 flex flex-col gap-5 md:mb-10 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
              {t("eyebrow")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              {t("title")}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-zinc-400">
              {t("subtitle")}
            </p>
          </div>
          <Link
            href="/wallpapers"
            className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-violet-300 transition hover:text-violet-200"
          >
            {t("viewAll")}
            <span
              aria-hidden
              className="transition-transform group-hover:translate-x-0.5"
            >
              &rarr;
            </span>
          </Link>
        </div>

        {/* Uniform 16:9 grid: 1 column mobile, 2 tablet, 3 desktop. Every
            featured piece is a landscape (16:9) original, so no cell is ever
            taller than its neighbours and the rows stay flush. Images are
            lazy (below the fold) and cropped, never stretched. */}
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {FEATURED_WALLPAPERS.map((wallpaper) => {
            const title = tWallpapers(`${wallpaper.id}.title`);
            return (
              <li key={wallpaper.id}>
                <Link
                  href={`/wallpapers/${wallpaper.id}`}
                  aria-label={t("cardAria", { title })}
                  className="group relative block overflow-hidden rounded-2xl border border-white/10 shadow-lg shadow-black/40 outline-none transition hover:border-violet-400/40 focus-visible:ring-2 focus-visible:ring-violet-400/60"
                >
                  <div
                    className="relative w-full overflow-hidden"
                    style={{ aspectRatio: "16 / 9" }}
                  >
                    <WallpaperImage
                      src={wallpaper.image ?? undefined}
                      alt={tWallpapers(`${wallpaper.id}.alt`)}
                      gradient={wallpaper.gradient}
                      srcSet={
                        wallpaper.image ? webpSrcSet(wallpaper.image) : undefined
                      }
                      // 1 column on phones, 2 on tablet, 3 within the
                      // max-w-[1280px] container from lg up.
                      sizes="(max-width: 639px) calc(100vw - 3rem), (max-width: 1023px) calc(50vw - 2.5rem), calc(33vw - 2.5rem)"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-white md:text-base">
                          {title}
                        </h3>
                        <p className="truncate text-xs text-zinc-400">
                          {tStyles(wallpaper.styleId)}
                        </p>
                      </div>
                      <span
                        aria-hidden
                        className="shrink-0 text-xs font-medium text-violet-300 opacity-0 transition duration-300 group-hover:opacity-100"
                      >
                        &rarr;
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          {t("licenseNote")}
        </p>
      </div>
    </section>
  );
}
