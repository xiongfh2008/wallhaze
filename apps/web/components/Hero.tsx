import { useTranslations } from "next-intl";
import { HERO_IMAGE } from "@/lib/styles";
import Button from "./ui/Button";
import WallpaperImage from "./WallpaperImage";

/**
 * Homepage hero. The primary CTA leads to the free gallery (browsing and
 * downloading need no account); the secondary CTA opens the AI Studio.
 * No copy promises free or unlimited AI generation.
 */
export default function Hero() {
  const t = useTranslations("hero");

  return (
    <section id="top" className="relative flex min-h-[min(88svh,48rem)] items-center overflow-hidden">
      <div className="absolute inset-0">
        <WallpaperImage
          src={HERO_IMAGE}
          alt=""
          gradient="from-violet-950 via-purple-950 to-black"
          eager
          priority
          className="animate-hero-zoom h-full w-full object-cover"
        />
        {/* Calm areas for text: darken left column and blend into the page below. */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-[#050308]" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-32 md:pb-24 md:pt-36">
        <p
          className="animate-fade-up mb-6 inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.25em] text-violet-300"
          style={{ animationDelay: "100ms" }}
        >
          <span className="h-px w-8 bg-gradient-to-r from-violet-400 to-transparent" />
          {t("eyebrow")}
        </p>

        <h1
          className="animate-fade-up max-w-3xl text-5xl font-semibold leading-[1.04] tracking-tight md:text-6xl lg:text-7xl"
          style={{ animationDelay: "220ms" }}
        >
          {t("titleLine1")}
          <br />
          <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent">
            {t("titleLine2")}
          </span>
        </h1>

        <p
          className="animate-fade-up mt-6 max-w-2xl text-lg leading-relaxed text-zinc-300 md:text-xl"
          style={{ animationDelay: "360ms" }}
        >
          {t("subtitle")}
        </p>

        <div
          className="animate-fade-up mt-8 flex flex-wrap items-center gap-4"
          style={{ animationDelay: "500ms" }}
        >
          <Button href="/wallpapers" size="lg">
            {t("ctaExplore")}
          </Button>
          <Button href="/studio" variant="secondary" size="lg">
            {t("ctaCreate")}
          </Button>
        </div>

        <p
          className="animate-fade-up mt-8 text-sm text-zinc-400"
          style={{ animationDelay: "640ms" }}
        >
          {t("footnote")}
        </p>
      </div>
    </section>
  );
}
