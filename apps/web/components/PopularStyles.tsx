import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { POPULAR_STYLES } from "@/lib/styles";
import WallpaperImage from "./WallpaperImage";

/**
 * Popular Styles: the six signature styles link straight into the AI Studio
 * with the style preselected via `?style=<id>` (StudioStylePreselect applies
 * it after mount). Server-rendered — no client JS.
 */
export default function PopularStyles() {
  const t = useTranslations("popular");
  const tStyles = useTranslations("styleLabels");

  return (
    <section id="styles" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 max-w-2xl md:mb-14">
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

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6">
          {POPULAR_STYLES.map((style) => (
            <Link
              key={style.id}
              href={`/studio?style=${style.id}`}
              className="group relative overflow-hidden rounded-2xl border border-white/10 text-left shadow-lg shadow-black/40 outline-none transition hover:border-violet-400/40 focus-visible:ring-2 focus-visible:ring-violet-400/60"
            >
              <div className="aspect-[3/4] w-full overflow-hidden">
                <WallpaperImage
                  src={style.image}
                  alt={t("sampleAlt", { style: tStyles(style.id) })}
                  gradient={style.gradient}
                  className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4 md:p-5">
                <div>
                  <h3 className="text-base font-semibold text-white md:text-lg">
                    {tStyles(style.id)}
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-400 opacity-0 transition duration-300 group-hover:opacity-100">
                    {t("tryInStudio")}
                  </p>
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 opacity-0 backdrop-blur transition duration-300 group-hover:bg-violet-500/50 group-hover:opacity-100">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 text-white"
                  >
                    <path d="M5 12h14m-6-6 6 6-6 6" />
                  </svg>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
