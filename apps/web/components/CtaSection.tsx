import { useTranslations } from "next-intl";
import Button from "./ui/Button";

export default function CtaSection() {
  const t = useTranslations("cta");

  return (
    <section id="cta" className="relative pb-16 pt-2 md:pb-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-violet-950/50 via-[#0b0514] to-black px-6 py-12 text-center md:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-64 w-[560px] max-w-full -translate-x-1/2 rounded-full bg-violet-600/25 blur-[120px]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
              {t("title")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-zinc-400">
              {t("body")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button href="/studio" size="lg">
                {t("button")}
              </Button>
              <Button href="/wallpapers" variant="secondary" size="lg">
                {t("explore")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
