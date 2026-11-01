import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { stripServerOnlyNamespaces } from "@/lib/client-messages";
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
    // Brand icons (2026-10-31 kit). `/favicon.ico` is left to the app-root
    // file convention, which emits it with a content hash (`?favicon.<hash>`)
    // — that also busts caches automatically. Every other size is declared
    // here once; no second metadata block can override these.
    icons: {
      icon: [
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
        { url: "/wallhaze-icon.svg", sizes: "any", type: "image/svg+xml" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    manifest: "/manifest.webmanifest",
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

  // Only ship the namespaces client components use to the client; legal and
  // metadata namespaces are consumed server-side (see lib/client-messages.ts).
  const clientMessages = stripServerOnlyNamespaces(await getMessages({ locale }));

  return (
    <html
      lang={HTML_LANG[locale]}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={clientMessages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
