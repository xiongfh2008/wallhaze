import type { Metadata } from "next";
import { Suspense } from "react";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { absoluteLocaleUrl, languageAlternates, OG_LOCALE } from "@/lib/seo";
import Footer from "@/components/Footer";
import GeneratorSection from "@/components/GeneratorSection";
import Header from "@/components/Header";
import StudioStylePreselect from "@/components/StudioStylePreselect";

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
      <Header />
      <main>
        <section className="relative mx-auto w-full max-w-6xl px-6 pb-4 pt-32 md:pt-40">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="animate-pulse-glow absolute left-1/2 top-0 h-[320px] w-[560px] max-w-full -translate-x-1/2 rounded-full bg-fuchsia-700/15 blur-[130px]" />
          </div>

          <div className="relative">
            <p className="inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
              <span className="h-px w-8 bg-gradient-to-r from-violet-400 to-transparent" />
              {t("eyebrow")}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl">
              {t("brand")}{" "}
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent">
                {t("accent")}
              </span>
            </h1>
            <p className="mt-4 max-w-2xl leading-relaxed text-zinc-400">
              {t("subtitle")}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
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

        {/* ?style=<id> deep links (style cards, related "create similar") —
            wrapped in Suspense as required for useSearchParams under
            cacheComponents. */}
        <Suspense fallback={null}>
          <StudioStylePreselect />
        </Suspense>

        <GeneratorSection variant="studio" />
      </main>
      <Footer />
    </div>
  );
}
