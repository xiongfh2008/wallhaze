import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HTML_LANG, routing, type Locale } from "@/i18n/routing";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Prerender every locale statically (cacheComponents friendly). */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** Prefix-free canonical path per locale (mirrors localePrefix: "as-needed"). */
const CANONICAL_HOME: Record<Locale, string> = {
  en: "/",
  zh: "/zh",
  ja: "/ja",
  ko: "/ko",
  es: "/es",
  fr: "/fr",
  de: "/de",
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

/**
 * Root layout for every language segment. Owns <html lang>, the global
 * fonts/stylesheet and the per-locale document metadata (title, description,
 * canonical, hreflang alternates). The header/footer stay mounted per page,
 * exactly as before the migration.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    metadataBase: new URL("https://wallhaze.com"),
    title: {
      // Subpages append their own title; the homepage keeps the default.
      template: "%s | WallHaze",
      default: t("homeTitle"),
    },
    description: t("homeDescription"),
    alternates: {
      canonical: CANONICAL_HOME[locale],
      languages: {
        en: "https://wallhaze.com/",
        "x-default": "https://wallhaze.com/",
        zh: "https://wallhaze.com/zh",
        ja: "https://wallhaze.com/ja",
        ko: "https://wallhaze.com/ko",
        es: "https://wallhaze.com/es",
        fr: "https://wallhaze.com/fr",
        de: "https://wallhaze.com/de",
      },
    },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale],
      url: `https://wallhaze.com${CANONICAL_HOME[locale]}`,
      siteName: "WallHaze",
      title: t("homeTitle"),
      description: t("homeDescription"),
    },
    twitter: {
      card: "summary_large_image",
      title: t("homeTitle"),
      description: t("homeDescription"),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Unknown language segments 404 instead of rendering the default locale
  // (verified in the stage-0 spike).
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Enables static rendering for this request — every page below inherits it.
  setRequestLocale(locale);

  return (
    <html
      lang={HTML_LANG[locale]}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
