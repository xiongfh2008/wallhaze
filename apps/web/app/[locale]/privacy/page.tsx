import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import ContentShell from "@/components/pages/ContentShell";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

/**
 * /privacy (FE09): STRUCTURE ONLY — an unreleased legal working draft.
 * It is marked as pending review (ContentShell draft badge), excluded from
 * search indexes, requires no user agreement, and makes NO claims about
 * data processing, retention or company identity before legal review.
 * Launch blocker: must be reviewed and replaced with effective text.
 */
const PRIVACY_PATH = "/privacy";

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
    path: PRIVACY_PATH,
    title: t("privacyTitle"),
    description: t("privacyDescription"),
    noindex: true,
  });
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const t = await getTranslations("privacy");

  const sections = [
    { title: t("scopeTitle"), body: t("scopeBody") },
    { title: t("dataTitle"), body: t("dataBody") },
    { title: t("cookiesTitle"), body: t("cookiesBody") },
    { title: t("retentionTitle"), body: t("retentionBody") },
    { title: t("rightsTitle"), body: t("rightsBody") },
    { title: t("contactTitle"), body: t("contactBody") },
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
