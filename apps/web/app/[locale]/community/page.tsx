import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { absoluteLocaleUrl, pageMetadata } from "@/lib/seo";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CommunityExperience from "@/components/community/CommunityExperience";
import MonthlyThemeSection from "@/components/community/MonthlyThemeSection";
import SubmissionPanel from "@/components/community/SubmissionPanel";
import {
  getSubmissionWorks,
  getThemeFeaturedWorks,
  reportMailto,
  submissionMailto,
} from "@/lib/community";
import { COMMUNITY_THEMES } from "@/lib/community/themes";
import { getDemoWorks, isCommunityDemoMode } from "@/lib/community/demo";

const PATH = "/community";

export async function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    locale,
    path: PATH,
    title: t("communityTitle"),
    description: t("communityDescription"),
  });
}

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations("community");
  const submissionWorks = getSubmissionWorks();
  const demoMode = isCommunityDemoMode();
  const demoWorks = demoMode ? getDemoWorks() : [];
  const featuredWorksByTheme = Object.fromEntries(
    COMMUNITY_THEMES.map((theme) => [theme.id, getThemeFeaturedWorks(theme)])
  );
  const communityUrl = absoluteLocaleUrl(locale, PATH);

  return (
    <div className="relative flex-1 overflow-x-clip">
      <Header />
      <main className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-28 md:pb-28 md:pt-36">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-950/45 via-[#0b0712] to-emerald-950/20 p-6 md:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl"
          />
          <p className="relative text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
            {t("eyebrow")}
          </p>
          <h1 className="relative mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
            {t("title")}
          </h1>
          <p className="relative mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 md:text-lg">
            {t("subtitle")}
          </p>
          <p className="relative mt-3 inline-flex rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-[11px] font-medium text-amber-100">
            {t("heroNote")}
          </p>
          <div className="relative mt-7 flex flex-wrap gap-3">
            <a
              href="#platform-showcase"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-2.5 text-sm font-semibold text-white outline-none transition hover:from-violet-500 hover:to-fuchsia-500 focus-visible:ring-2 focus-visible:ring-violet-300/80"
            >
              {t("exploreCta")}
            </a>
            <a
              href={submissionMailto()}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-white/5 px-6 py-2.5 text-sm font-semibold text-zinc-100 outline-none transition hover:border-white/35 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-violet-300/80"
            >
              {t("submitCta")}
            </a>
            <a
              href="#submit"
              className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-violet-300 underline-offset-4 transition hover:text-violet-200 hover:underline"
            >
              {t("howSubmit")}
            </a>
          </div>
        </section>

        <MonthlyThemeSection
          themes={COMMUNITY_THEMES}
          featuredWorksByTheme={featuredWorksByTheme}
        />

        <div className="mt-10 md:mt-12">
          <CommunityExperience
            submissionWorks={submissionWorks}
            demoWorks={demoWorks}
          />
        </div>

        <SubmissionPanel />

        <section
          id="report"
          aria-labelledby="report-heading"
          className="scroll-mt-24 border-t border-white/10 py-12"
        >
          <h2 id="report-heading" className="text-xl font-semibold">
            {t("reportTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            {t("reportBody")}
          </p>
          <a
            href={reportMailto(t("reportTitle"), communityUrl)}
            className="mt-4 inline-flex min-h-10 items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-100 outline-none transition hover:border-white/30 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-violet-300/80"
          >
            {t("reportCta")}
          </a>
        </section>
      </main>
      <Footer />
    </div>
  );
}
