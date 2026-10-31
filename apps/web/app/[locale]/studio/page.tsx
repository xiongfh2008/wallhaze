import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { absoluteLocaleUrl, languageAlternates, OG_LOCALE } from "@/lib/seo";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

/**
 * The /studio workspace: a dedicated creation flow for AI wallpapers.
 * The page itself is a thin Server Component shell (heading, navigation,
 * metadata) — all generation state, requests, ratio config, My Library and
 * downloads come from the shared GeneratorSection client component, so the
 * homepage and /studio can never drift apart.
 */

/** Prefix-free canonical path per locale (mirrors localePrefix: "as-needed"). */
const STUDIO_PATH = "/studio";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    title: t("studioTitle"),
    description: t("studioDescription"),
    alternates: {
      canonical: absoluteLocaleUrl(locale, STUDIO_PATH),
      languages: languageAlternates(STUDIO_PATH),
    },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale],
      url: absoluteLocaleUrl(locale, STUDIO_PATH),
      siteName: "WallHaze",
      title: t("studioTitle"),
      description: t("studioDescription"),
    },
    twitter: {
      card: "summary_large_image",
      title: t("studioTitle"),
      description: t("studioDescription"),
    },
  };
}

export default async function StudioPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const t = await getTranslations("studio");

  return (
    <div className="relative flex-1 overflow-x-clip">
      <Header maxWidthClassName="max-w-[1320px]" />
      <main>
        <section className="relative mx-auto w-full max-w-[1320px] px-6 pb-2 pt-24 md:pt-28">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="animate-pulse-glow absolute left-1/2 top-0 h-[320px] w-[560px] max-w-full -translate-x-1/2 rounded-full bg-fuchsia-700/15 blur-[130px]" />
          </div>

          <div className="relative">
            <p className="inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
              <span className="h-px w-8 bg-gradient-to-r from-violet-400 to-transparent" />
              {t("eyebrow")}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
              {t("brand")}{" "}
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent">
                {t("accent")}
              </span>
            </h1>
            <p className="mt-3 max-w-2xl leading-relaxed text-zinc-400">
              {t("subtitle")}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/35 hover:text-white"
              >
                {t("backHome")}
              </Link>
              <Link
                href="/wallpapers"
                className="text-sm text-zinc-400 underline-offset-4 transition hover:text-white hover:underline"
              >
                {t("browseGallery")}
              </Link>
            </div>
          </div>
        </section>

        {/* Waffo remediation (2026-10-31): AI creation is NOT open to the
            public. The interactive Studio (StudioStylePreselect +
            StudioExperience) stays in the codebase but is not rendered —
            restore both blocks below when creation officially launches. */}

        {/* Product decision (2026-10-31): the underlying model names/versions
            are NOT shown to users — the Studio stays simple (type, style,
            device, parameters). Review-tooling disclosures live in the
            Privacy Policy and the Acceptable Use Policy. A compact pricing
            link remains for cost transparency. */}
        {/* Prominent coming-soon state: no generate affordances while the
            feature is closed. The interactive form returns with the flag. */}
        <section
          id="ai-coming-soon"
          aria-labelledby="ai-coming-soon-title"
          className="mx-auto mt-12 w-full max-w-[1320px] scroll-mt-24 px-6"
        >
          <div className="rounded-3xl border border-violet-400/25 bg-violet-500/[0.06] p-8 text-center md:p-14">
            <p className="inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-amber-200">
              {t("comingEyebrow")}
            </p>
            <h2
              id="ai-coming-soon-title"
              className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-white md:text-4xl"
            >
              {t("comingTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-zinc-300">
              {t("comingBody")}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
        </section>
      </main>
      <Footer />
    </div>
  );
}
