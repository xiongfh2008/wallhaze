import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import Footer from "@/components/Footer";
import GeneratorSection from "@/components/GeneratorSection";
import Header from "@/components/Header";

/**
 * The /studio workspace: a dedicated creation flow for AI wallpapers.
 * The page itself is a thin Server Component shell (heading, navigation,
 * metadata) — all generation state, requests, ratio config, My Library and
 * downloads come from the shared GeneratorSection client component, so the
 * homepage and /studio can never drift apart.
 */

/** Prefix-free canonical path per locale (mirrors localePrefix: "as-needed"). */
const CANONICAL_STUDIO: Record<Locale, string> = {
  en: "/studio",
  zh: "/zh/studio",
  ja: "/ja/studio",
  ko: "/ko/studio",
  es: "/es/studio",
  fr: "/fr/studio",
  de: "/de/studio",
};

const OG_LOCALE: Record<Locale, string> = {
  en: "en_US",
  zh: "zh_CN",
  ja: "ja_JP",
  ko: "ko_KR",
  es: "es_ES",
  fr: "fr_FR",
  de: "de_DE",
};

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
      canonical: CANONICAL_STUDIO[locale],
      languages: {
        en: "https://wallhaze.com/studio",
        "x-default": "https://wallhaze.com/studio",
        zh: "https://wallhaze.com/zh/studio",
        ja: "https://wallhaze.com/ja/studio",
        ko: "https://wallhaze.com/ko/studio",
        es: "https://wallhaze.com/es/studio",
        fr: "https://wallhaze.com/fr/studio",
        de: "https://wallhaze.com/de/studio",
      },
    },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale],
      url: `https://wallhaze.com${CANONICAL_STUDIO[locale]}`,
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
                href="/#explore"
                className="text-sm text-zinc-400 underline-offset-4 transition hover:text-white hover:underline"
              >
                {t("browseGallery")}
              </Link>
            </div>
          </div>
        </section>

        <GeneratorSection variant="studio" />
      </main>
      <Footer />
    </div>
  );
}
