import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HTML_LANG, routing } from "@/i18n/routing";
import { absoluteLocaleUrl, languageAlternates, OG_LOCALE } from "@/lib/seo";
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

const HOME_PATH = "/";

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
      canonical: absoluteLocaleUrl(locale, HOME_PATH),
      languages: languageAlternates(HOME_PATH),
    },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale],
      url: absoluteLocaleUrl(locale, HOME_PATH),
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
