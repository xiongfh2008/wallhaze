import CtaSection from "@/components/CtaSection";
import Footer from "@/components/Footer";
import GeneratorSection from "@/components/GeneratorSection";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import PopularStyles from "@/components/PopularStyles";
import TrendingMarquee from "@/components/TrendingMarquee";
import WhySection from "@/components/WhySection";

export default function Home() {
  return (
    <div className="relative flex-1 overflow-x-clip">
      <Header />
      <main>
        <Hero />
        <TrendingMarquee />
        <GeneratorSection />
        <PopularStyles />
        <WhySection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
