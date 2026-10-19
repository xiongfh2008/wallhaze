import { useTranslations } from "next-intl";

export default function CtaSection() {
  const t = useTranslations("cta");

  return (
    <section className="relative pb-24 pt-4 md:pb-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-violet-950/50 via-[#0b0514] to-black px-6 py-16 text-center md:py-24">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-64 w-[560px] max-w-full -translate-x-1/2 rounded-full bg-violet-600/25 blur-[120px]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
              {t("title")}
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-relaxed text-zinc-400">
              {t("body")}
            </p>
            <a
              href="#generator"
              className="mt-10 inline-flex rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-9 py-4 text-sm font-semibold shadow-xl shadow-violet-950/50 transition hover:brightness-110 active:scale-[0.98]"
            >
              {t("button")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
