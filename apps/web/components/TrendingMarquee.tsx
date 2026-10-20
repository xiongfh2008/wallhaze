import { useTranslations } from "next-intl";
import { DEMO_SAMPLE_IMAGE, HERO_IMAGE, POPULAR_STYLES } from "@/lib/styles";
import WallpaperImage from "./WallpaperImage";

export default function TrendingMarquee() {
  const t = useTranslations("trending");
  const tStyles = useTranslations("styleLabels");

  const ITEMS = [
    ...POPULAR_STYLES.map((style) => ({
      src: style.image,
      gradient: style.gradient,
      // Brand/art names stay untranslated ("Nebula", "Haze"); style labels
      // resolve through the styleLabels dictionary.
      label: tStyles(style.id),
    })),
    {
      src: DEMO_SAMPLE_IMAGE,
      gradient: "from-violet-500 via-purple-900 to-black",
      label: "Nebula",
    },
    {
      src: HERO_IMAGE,
      gradient: "from-violet-950 via-purple-950 to-black",
      label: "Haze",
    },
  ];

  return (
    <section
      aria-label={t("aria")}
      className="relative border-y border-white/5 bg-white/[0.02] py-10 md:py-12"
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
              {ITEMS.map((item, index) => (
                <figure
                  key={index}
                  className="group/figure relative h-44 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 md:h-60 md:w-32"
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
