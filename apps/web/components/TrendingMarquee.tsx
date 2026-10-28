import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { STYLE_SPOTLIGHT } from "@/lib/wallpapers";
import WallpaperImage from "./WallpaperImage";

/**
 * Homepage "More styles, more inspiration" band — a calm, touch-friendly
 * scroll-snap rail of style preview cards. No auto-scroll animation; cards
 * use a uniform 3:4 portrait ratio with adaptive cropping, a title scrim and
 * hover affordances. Selection is editorial (STYLE_SPOTLIGHT): no card
 * repeats an image used by the hero, the style navigation or the featured
 * grid, and every card links to the style's wallpaper page (when a cleared
 * preset exists) or to the studio preselected with that style.
 */
export default function TrendingMarquee() {
  const t = useTranslations("trending");
  const tStyles = useTranslations("styleLabels");

  return (
    <section
      aria-label={t("aria")}
      className="relative border-y border-white/5 bg-white/[0.02] py-12 md:py-16"
    >
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
          {t("title")}
        </p>
      </div>

      {/* Full-bleed scroll rail: native touch swipe, snap alignment, a cut-off
          card at the right edge inviting scroll. Images stay lazy — the band
          sits below the fold. */}
      <div className="mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 [scroll-padding-inline:1.5rem] md:mt-8 md:gap-5">
        {STYLE_SPOTLIGHT.map(({ style, wallpaper }) => {
          const label = tStyles(style.id);
          const href = wallpaper
            ? `/wallpapers/${wallpaper.id}`
            : `/studio?style=${style.id}`;
          return (
            <Link
              key={style.id}
              href={href}
              aria-label={t("cardAria", { label })}
              className="group relative block w-[46vw] max-w-[224px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 shadow-lg shadow-black/40 outline-none transition hover:border-violet-400/40 focus-visible:ring-2 focus-visible:ring-violet-400/60 sm:w-[38vw] md:w-[224px]"
            >
              <div
                className="relative w-full overflow-hidden"
                style={{ aspectRatio: "3 / 4" }}
              >
                <WallpaperImage
                  src={style.image}
                  alt={t("previewAlt", { label })}
                  gradient={style.gradient}
                  className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3.5">
                  <h3 className="truncate text-sm font-semibold text-white">
                    {label}
                  </h3>
                  <span
                    aria-hidden
                    className="shrink-0 text-xs font-medium text-violet-300 opacity-0 transition duration-300 group-hover:opacity-100"
                  >
                    &rarr;
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
