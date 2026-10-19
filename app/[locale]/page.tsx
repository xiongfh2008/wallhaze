import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import CtaSection from "@/components/CtaSection";
import Footer from "@/components/Footer";
import GeneratorSection from "@/components/GeneratorSection";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import PopularStyles from "@/components/PopularStyles";
import TrendingMarquee from "@/components/TrendingMarquee";
import WallpaperGallery from "@/components/WallpaperGallery";
import WhySection from "@/components/WhySection";

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
        <WallpaperGallery />
        <GeneratorSection />
        <PopularStyles />
        <WhySection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
