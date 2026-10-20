import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import CtaSection from "@/components/CtaSection";
import FeaturedWallpapers from "@/components/FeaturedWallpapers";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import PopularStyles from "@/components/PopularStyles";
import TrendingMarquee from "@/components/TrendingMarquee";

/**
 * Homepage: hero with gallery/studio CTAs, a visual marquee, the featured
 * subset of the static gallery, style entries and the three-step flow.
 * The full AI generator lives on /studio — this keeps the homepage mostly
 * server-rendered (fast first paint, minimal client JS).
 */
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Static rendering for this page's render pass — required per page under
  // cacheComponents so server-side useTranslations stays prerenderable.
  setRequestLocale(locale);

  return (
    <div className="relative flex-1 overflow-x-clip">
      <Header />
      <main>
        <Hero />
        <TrendingMarquee />
        <FeaturedWallpapers />
        <PopularStyles />
        <HowItWorks />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
