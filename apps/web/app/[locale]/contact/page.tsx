import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import ContentShell from "@/components/pages/ContentShell";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

/**
 * /contact (FE09). No official support email or ticket channel has been
 * confirmed, so none is invented and NO fake submission form exists —
 * the page states exactly that. Public content page: indexable.
 */
const CONTACT_PATH = "/contact";

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
    path: CONTACT_PATH,
    title: t("contactTitle"),
    description: t("contactDescription"),
  });
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const t = await getTranslations("contact");

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-clip">
      <Header />
      <ContentShell
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
      >
        <section
          aria-labelledby="contact-channel"
          className="rounded-2xl border border-white/10 bg-white/[0.02] p-6"
        >
          <h2 id="contact-channel" className="text-lg font-semibold">
            {t("unavailableTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {t("unavailableBody")}
          </p>
        </section>

        <section aria-labelledby="contact-feedback" className="mt-8">
          <h2 id="contact-feedback" className="text-lg font-semibold">
            {t("feedbackTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {t("feedbackBody")}
          </p>
        </section>

        <section aria-labelledby="contact-social" className="mt-8">
          <h2 id="contact-social" className="text-lg font-semibold">
            {t("socialTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {t("socialBody")}
          </p>
        </section>
      </ContentShell>
      <Footer />
    </div>
  );
}
