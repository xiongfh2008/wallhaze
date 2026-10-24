import { useTranslations } from "next-intl";
import { FEATURED_WALLPAPERS } from "@/lib/wallpapers";
import { POPULAR_STYLES, WALLPAPER_STYLES } from "@/lib/styles";
import WallpaperImage from "./WallpaperImage";

/**
 * A purely visual style band between the hero and the featured wallpapers.
 * It only uses styles with a cleared preview image and avoids repeating an
 * exact image used by the style navigation or featured grid. No
 * "trending"/popularity claim is made.
 */
export default function TrendingMarquee() {
  const t = useTranslations("trending");
  const tStyles = useTranslations("styleLabels");

  const usedImages = new Set<string>(
    [
      ...POPULAR_STYLES.map((style) => style.image),
      ...FEATURED_WALLPAPERS.map((wallpaper) => wallpaper.image),
    ].filter((image): image is string => Boolean(image))
  );
  const ITEMS = WALLPAPER_STYLES.filter(
    (style) => style.image && !usedImages.has(style.image)
  )
    .slice(0, 8)
    .map((style) => ({
      src: style.image as string,
      gradient: style.gradient,
      label: tStyles(style.id),
    }));

  return (
    <section
      aria-label={t("aria")}
      className="relative border-y border-white/5 bg-white/[0.02] py-8 md:py-10"
    >
      <p className="mb-6 text-center text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
        {t("title")}
      </p>

      <div className="group overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div className="animate-marquee flex w-max group-hover:[animation-play-state:paused]">
          {[0, 1].map((copy) => (
            <div
              key={copy}
              aria-hidden={copy === 1}
              className="flex gap-4 pr-4"
            >
              {ITEMS.map((item) => (
                <figure
                  key={`${copy}-${item.label}`}
                  className="group/figure relative h-40 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 md:h-56 md:w-32"
                >
                  <WallpaperImage
                    src={item.src}
                    alt={t("previewAlt", { label: item.label })}
                    gradient={item.gradient}
                    className="h-full w-full object-cover transition duration-500 group-hover/figure:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <figcaption className="absolute bottom-2 left-2.5 text-xs font-medium text-white/90">
                    {item.label}
                  </figcaption>
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
