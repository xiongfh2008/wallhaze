import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { POPULAR_STYLES } from "@/lib/styles";
import WallpaperImage from "./WallpaperImage";

/**
 * Style navigation: six signature styles link into the Studio with the style
 * preselected via `?style=<id>` (StudioStylePreselect applies it after mount).
 * Compact horizontal tiles rather than a second gallery — name, short
 * description and an explicit link are always visible. Server-rendered.
 */
export default function PopularStyles() {
  const t = useTranslations("popular");
  const tStyles = useTranslations("styleLabels");
  const tDescriptions = useTranslations("styleDescriptions");

  return (
    <section id="styles" className="relative py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-8 max-w-2xl md:mb-10">
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

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {POPULAR_STYLES.map((style) => (
            <li key={style.id}>
              <Link
                href={`/studio?style=${style.id}`}
                className="group flex min-h-[104px] items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-left outline-none transition hover:border-violet-400/40 hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-violet-400/60"
              >
                <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl md:h-24 md:w-24">
                  <WallpaperImage
                    src={style.image}
                    alt={t("sampleAlt", { style: tStyles(style.id) })}
                    gradient={style.gradient}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-white">
                      {tStyles(style.id)}
                    </h3>
                    <span
                      aria-hidden
                      className="shrink-0 text-violet-300 transition group-hover:translate-x-0.5"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <path d="M5 12h14m-6-6 6 6-6 6" />
                      </svg>
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-snug text-zinc-400">
                    {tDescriptions(style.id)}
                  </span>
                  <span className="mt-2 block text-xs font-medium text-violet-300">
                    {t("tryInStudio")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
