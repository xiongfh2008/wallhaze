import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import ContentShell from "@/components/pages/ContentShell";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

/**
 * /help (FE09): basic usage instructions and troubleshooting, aligned with
 * how the product actually behaves today. Public content page: indexable.
 */
const HELP_PATH = "/help";

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
    path: HELP_PATH,
    title: t("helpTitle"),
    description: t("helpDescription"),
  });
}

export default async function HelpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const t = await getTranslations("help");

  const trouble = [1, 2, 3].map((n) => ({
    title: t(`t${n}Title` as const),
    body: t(`t${n}Body` as const),
  }));

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-clip">
      <Header />
      <ContentShell
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
      >
        <section aria-labelledby="help-start">
          <h2 id="help-start" className="text-lg font-semibold">
            {t("startTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {t("startBody")}
          </p>
        </section>

        <section aria-labelledby="help-download" className="mt-8">
          <h2 id="help-download" className="text-lg font-semibold">
            {t("downloadTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {t("downloadBody")}
          </p>
        </section>

        <section aria-labelledby="help-studio" className="mt-8">
          <h2 id="help-studio" className="text-lg font-semibold">
            {t("studioTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {t("studioBody")}
          </p>
        </section>

        <section aria-labelledby="help-trouble" className="mt-8">
          <h2 id="help-trouble" className="text-lg font-semibold">
            {t("troubleshootTitle")}
          </h2>
          <dl className="mt-3 space-y-5">
            {trouble.map((item) => (
              <div key={item.title}>
                <dt className="font-medium text-zinc-200">{item.title}</dt>
                <dd className="mt-1 leading-relaxed text-zinc-400">
                  {item.body}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mt-10 border-t border-white/10 pt-6 text-sm text-zinc-500">
          <Link
            href="/faq"
            className="text-violet-300 underline-offset-4 transition hover:text-violet-200 hover:underline"
          >
            FAQ
          </Link>
          {" · "}
          <Link
            href="/contact"
            className="text-violet-300 underline-offset-4 transition hover:text-violet-200 hover:underline"
          >
            {t("moreHelpLabel")}
          </Link>
        </p>
      </ContentShell>
      <Footer />
    </div>
  );
}
