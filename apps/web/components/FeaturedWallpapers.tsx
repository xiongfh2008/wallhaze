import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FEATURED_WALLPAPERS, type PresetWallpaper } from "@/lib/wallpapers";
import WallpaperImage from "./WallpaperImage";

interface WallpaperLinkCardProps {
  wallpaper: PresetWallpaper;
  /** Localized title. */
  title: string;
  /** Localized alt text. */
  alt: string;
  styleLabel: string;
  /** Accessible link name. */
  viewLabel: string;
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
  priority = false,
}: WallpaperLinkCardProps) {
  return (
    <Link
      href={`/wallpapers/${wallpaper.id}`}
      aria-label={viewLabel}
      className="group relative block overflow-hidden rounded-2xl border border-white/10 shadow-lg shadow-black/40 outline-none transition hover:border-violet-400/40 focus-visible:ring-2 focus-visible:ring-violet-400/60"
    >
      <div className="aspect-[3/4] w-full overflow-hidden">
        <WallpaperImage
          src={wallpaper.image}
          alt={alt}
          gradient={wallpaper.gradient}
          eager={priority}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white md:text-base">
            {title}
          </h3>
          <p className="truncate text-xs text-zinc-400">{styleLabel}</p>
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
 * Homepage "Featured Wallpapers": a fixed, hand-picked subset of the static
 * gallery (server-rendered) linking to detail pages. No fabricated trending
 * or popularity claims — selection is editorial.
 */
export default function FeaturedWallpapers() {
  const t = useTranslations("featured");
  const tWallpapers = useTranslations("galleryWallpapers");
  const tStyles = useTranslations("styleLabels");

  return (
    <section id="featured" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 flex flex-col gap-6 md:mb-12 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
              {t("eyebrow")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
              {t("title")}
            </h2>
            <p className="mt-4 leading-relaxed text-zinc-400">
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

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
          {FEATURED_WALLPAPERS.map((wallpaper, index) => (
            <WallpaperLinkCard
              key={wallpaper.id}
              wallpaper={wallpaper}
              title={tWallpapers(`${wallpaper.id}.title`)}
              alt={tWallpapers(`${wallpaper.id}.alt`)}
              styleLabel={tStyles(wallpaper.styleId)}
              viewLabel={t("cardAria", {
                title: tWallpapers(`${wallpaper.id}.title`),
              })}
              priority={index < 4}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
