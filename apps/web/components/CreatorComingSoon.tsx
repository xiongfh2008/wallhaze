import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Homepage "AI creation" section (2026-10-31 Waffo remediation): replaces
 * the interactive generator while AI creation is closed to the public.
 * Same section styling and anchor surface as the previous generator block;
 * the full GeneratorSection component remains in the codebase and returns
 * here when creation officially launches.
 */
export default function CreatorComingSoon() {
  const t = useTranslations("studio");

  return (
    <section id="generator" className="relative py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-8 max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
            {t("eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            {t("comingTitle")}
          </h2>
        </div>
        <div className="rounded-3xl border border-violet-400/20 bg-violet-500/[0.05] p-8 md:p-12">
          <p className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
            {t("comingTitle")}
          </p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300">
            {t("comingBody")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 cursor-not-allowed items-center rounded-full border border-white/10 bg-white/[0.04] px-6 text-sm font-medium text-zinc-500"
            >
              {t("comingCta")}
            </span>
            <Link
              href="/wallpapers"
              className="inline-flex min-h-11 items-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 text-sm font-medium text-white shadow-lg shadow-violet-900/40 transition hover:opacity-90"
            >
              {t("browseGallery")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
