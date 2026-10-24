import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import ContentShell from "@/components/pages/ContentShell";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

/**
 * /terms (FE09): STRUCTURE ONLY — an unreleased legal working draft.
 * Marked as pending review (ContentShell draft badge), excluded from search
 * indexes, not binding, requires no agreement, and states NO refund rights,
 * retention periods, jurisdiction or company entity before legal review.
 * Launch blocker: must be reviewed and replaced with effective text.
 */
const TERMS_PATH = "/terms";

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
    path: TERMS_PATH,
    title: t("termsTitle"),
    description: t("termsDescription"),
    noindex: true,
  });
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const t = await getTranslations("terms");

  const sections = [
    { title: t("serviceTitle"), body: t("serviceBody") },
    { title: t("ipTitle"), body: t("ipBody") },
    { title: t("paymentsTitle"), body: t("paymentsBody") },
    { title: t("aiTitle"), body: t("aiBody") },
    { title: t("changesTitle"), body: t("changesBody") },
    { title: t("governingTitle"), body: t("governingBody") },
  ];

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-clip">
      <Header />
      <ContentShell
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("intro")}
        draft
      >
        <dl className="space-y-8">
          {sections.map((section) => (
            <div key={section.title}>
              <dt className="font-medium text-zinc-100">{section.title}</dt>
              <dd className="mt-2 leading-relaxed text-zinc-400">
                {section.body}
              </dd>
            </div>
          ))}
        </dl>
      </ContentShell>
      <Footer />
    </div>
  );
}
