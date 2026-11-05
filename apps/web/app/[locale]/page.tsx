import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HTML_LANG, routing } from "@/i18n/routing";
import { absoluteLocaleUrl, languageAlternates, OG_LOCALE, SITE_URL } from "@/lib/seo";
import CtaSection from "@/components/CtaSection";
import FeaturedWallpapers from "@/components/FeaturedWallpapers";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import PopularStyles from "@/components/PopularStyles";
import StudioIntro from "@/components/StudioIntro";
import TrendingMarquee from "@/components/TrendingMarquee";
import WhyWallHaze from "@/components/WhyWallHaze";

const HOME_PATH = "/";

/**
 * Homepage: hero with gallery/studio CTAs, a visual marquee, the featured
 * subset of the static gallery, style entries and the three-step flow.
 * The full AI generator lives on /studio — this keeps the homepage mostly
 * server-rendered (fast first paint, minimal client JS).
 */

/**
 * Bing fix: without page-level metadata the homepage streams as an RSC
 * shell + late restore segment, and vinext emits the layout's metadata
 * inside a hidden `<div id="S:0">` in the BODY — the raw HTML has NO
 * <title>/<meta description> in <head> (raw-HTML crawlers like Bing read
 * exactly that). An EMPTY export did not change the streaming branch, so
 * the page returns its full metadata explicitly, mirroring the layout's
 * homepage values. Keep in sync with app/[locale]/layout.tsx.
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
  };
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Enables static rendering for this request — required per page under
  // cacheComponents so server-side useTranslations stays prerenderable.
  setRequestLocale(locale);

  // Site-wide JSON-LD, homepage only: real Organization facts only —
  // no invented address, phone number or legal entity.
  const organizationLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "WallHaze",
        url: SITE_URL,
        logo: `${SITE_URL}/wallhaze-icon.svg`,
        email: "hello@wallhaze.com",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: absoluteLocaleUrl(locale, "/"),
        name: "WallHaze",
        inLanguage: HTML_LANG[locale],
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <div className="relative flex-1 overflow-x-clip">
      <Header />
      <main>
        <Hero />
        <TrendingMarquee />
        <FeaturedWallpapers />
        <PopularStyles />
        <StudioIntro />
        <HowItWorks />
        <WhyWallHaze />
        <CtaSection />
      </main>
      <Footer />
      <script
        type="application/ld+json"
        // Static JSON from constants — no user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
      />
    </div>
  );
}
