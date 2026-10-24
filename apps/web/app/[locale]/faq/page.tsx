import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import ContentShell from "@/components/pages/ContentShell";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

/**
 * /faq (FE09): covers the confirmed product facts — free gallery usage,
 * downloads, what the Studio is, the Credits concept, why generation is
 * not open yet, licensing limits, local vs cloud history, accounts.
 * Public content page: indexable.
 */
const FAQ_PATH = "/faq";

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
    path: FAQ_PATH,
    title: t("faqTitle"),
    description: t("faqDescription"),
  });
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const t = await getTranslations("faq");

  const items = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    q: t(`q${n}Q` as const),
    a: t(`q${n}A` as const),
  }));

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-clip">
      <Header />
      <ContentShell
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
      >
        <dl className="space-y-8">
          {items.map((item) => (
            <div key={item.q}>
              <dt className="font-medium text-zinc-100">{item.q}</dt>
              <dd className="mt-2 leading-relaxed text-zinc-400">{item.a}</dd>
            </div>
          ))}
        </dl>
      </ContentShell>
      <Footer />
    </div>
  );
}
