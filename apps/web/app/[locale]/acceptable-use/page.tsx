import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import ContentShell from "@/components/pages/ContentShell";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { Link } from "@/i18n/navigation";

/**
 * /acceptable-use (Waffo review): the effective Acceptable Use Policy.
 * Public, indexable, no sign-in required. Defines the six prohibited content
 * categories, supplementary rules, how screening works, enforcement and the
 * report/appeal channel — all sourced from the `aup` message namespace.
 */
const AUP_PATH = "/acceptable-use";

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
    path: AUP_PATH,
    title: t("aupTitle"),
    description: t("aupDescription"),
  });
}

export default async function AcceptableUsePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const t = await getTranslations("aup");
  const categories = t.raw("categories") as Array<{
    name: unknown;
    body: unknown;
  }>;
  const additionalItems = t.raw("additionalItems") as unknown[];

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-clip">
      <Header />
      <ContentShell eyebrow={t("eyebrow")} title={t("title")} subtitle={t("intro")}>
        <p className="text-sm text-zinc-500">{t("updated")}</p>

        <section aria-labelledby="aup-standards" className="mt-10">
          <h2 id="aup-standards" className="text-lg font-semibold">
            {t("standardsTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {t("standardsIntro")}
          </p>
          <dl className="mt-6 space-y-4">
            {categories.map((category) => (
              <div
                key={typeof category.name === "string" ? category.name : ""}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
              >
                <dt className="font-medium text-zinc-100">
                  {typeof category.name === "string" ? category.name : ""}
                </dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                  {typeof category.body === "string" ? category.body : ""}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="aup-additional" className="mt-10">
          <h2 id="aup-additional" className="text-lg font-semibold">
            {t("additionalTitle")}
          </h2>
          <ul className="mt-4 list-disc space-y-3 pl-5 marker:text-violet-400/70">
            {Array.isArray(additionalItems)
              ? additionalItems.map((item, index) =>
                  typeof item === "string" ? (
                    <li key={index} className="leading-relaxed text-zinc-400">
                      {item}
                    </li>
                  ) : null
                )
              : null}
          </ul>
        </section>

        <section aria-labelledby="aup-screening" className="mt-10">
          <h2 id="aup-screening" className="text-lg font-semibold">
            {t("screeningTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {t("screeningBody")}
          </p>
        </section>

        <section aria-labelledby="aup-enforcement" className="mt-10">
          <h2 id="aup-enforcement" className="text-lg font-semibold">
            {t("enforcementTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {t("enforcementBody")}
          </p>
        </section>

        <section aria-labelledby="aup-report" className="mt-10">
          <h2 id="aup-report" className="text-lg font-semibold">
            {t("reportTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {t("reportBody")}
          </p>
        </section>

        <section aria-labelledby="aup-terms" className="mt-10">
          <h2 id="aup-terms" className="text-lg font-semibold">
            {t("termsTitle")}
          </h2>
          <p className="mt-2 leading-relaxed text-zinc-400">
            {t("termsBody")}{" "}
            <Link
              href="/terms"
              className="font-medium text-violet-300 underline-offset-4 transition hover:text-violet-200 hover:underline"
            >
              {t("termsLink")}
            </Link>
          </p>
        </section>
      </ContentShell>
      <Footer />
    </div>
  );
}
