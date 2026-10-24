import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import ContentShell from "@/components/pages/ContentShell";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

/**
 * /about (FE09): describes ONLY the currently confirmed WallHaze
 * capabilities — no invented company details, team size, user counts or
 * partners. Public content page: indexable.
 */
const ABOUT_PATH = "/about";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    locale,
    path: ABOUT_PATH,
    title: t("aboutTitle"),
    description: t("aboutDescription"),
  });
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const t = await getTranslations("about");

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-clip">
      <Header />
      <ContentShell eyebrow={t("eyebrow")} title={t("title")}>
        <p className="max-w-2xl text-lg leading-relaxed text-zinc-300">
          {t("intro")}
        </p>

        <section aria-labelledby="about-what" className="mt-10">
          <h2 id="about-what" className="text-lg font-semibold">
            {t("whatTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">{t("whatBody")}</p>
        </section>

        <section aria-labelledby="about-caps" className="mt-10">
          <h2
            id="about-caps"
            className="sr-only"
          >
            {t("capGalleryTitle")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { title: t("capGalleryTitle"), body: t("capGalleryBody") },
              { title: t("capStudioTitle"), body: t("capStudioBody") },
              { title: t("capLanguagesTitle"), body: t("capLanguagesBody") },
            ].map((cap) => (
              <div
                key={cap.title}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
              >
                <p className="font-medium text-zinc-100">{cap.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                  {cap.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="about-roadmap" className="mt-10">
          <h2 id="about-roadmap" className="text-lg font-semibold">
            {t("roadmapTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {t("roadmapBody")}
          </p>
        </section>

        <section aria-labelledby="about-disclaimer" className="mt-10">
          <h2 id="about-disclaimer" className="text-lg font-semibold">
            {t("disclaimerTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {t("disclaimerBody")}
          </p>
        </section>
      </ContentShell>
      <Footer />
    </div>
  );
}
