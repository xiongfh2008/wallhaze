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
 * Microsoft Clarity analytics. Loaded ONLY when NEXT_PUBLIC_CLARITY_ID is
 * set at build time — local dev and tests stay analytics-free. The raw
 * <script> ships as static SSR HTML (framework-free, no next/script
 * dependency). The ID is validated against Clarity's alphanumeric format
 * before being interpolated into the snippet. The snippet registers the
 * window.clarity queue immediately but only injects the loader script on
 * window "load": clarity.js costs ~0.5s of main-thread eval, which must not
 * sit inside the LCP window.
 */
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;
const CLARITY_ENABLED = !!CLARITY_ID && /^[a-z0-9]+$/i.test(CLARITY_ID);
const CLARITY_SNIPPET =
  '(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};' +
  'function b(){t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;' +
  'y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)}' +
  'if(l.readyState==="complete"){b()}else{c.addEventListener("load",b)}})' +
  `(window, document, "clarity", "script", "${CLARITY_ID ?? ""}");`;

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
    // Search-engine ownership verifications (Next metadata API renders them
    // as <meta name="..."> tags inside <head>).
    verification: {
      yandex: "472aa98fe628d2fe",
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

  // Only ship the namespaces client components use to the client; legal and
  // metadata namespaces are consumed server-side (see lib/client-messages.ts).
  const clientMessages = stripServerOnlyNamespaces(await getMessages({ locale }));

  return (
    <html
      lang={HTML_LANG[locale]}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        No manual <head>: vinext emits metadata-managed tags there. A manual
        <head> on the default-locale root path pushed layout metadata into a
        late restore segment in production (S:0) — raw crawlers lost the
        title. Clarity therefore loads from the top of <body>: async and
        analytics-only, position is inconsequential for it.
      */}
      <body className="min-h-full flex flex-col">
        {CLARITY_ENABLED ? (
          <script dangerouslySetInnerHTML={{ __html: CLARITY_SNIPPET }} />
        ) : null}
        <NextIntlClientProvider messages={clientMessages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
