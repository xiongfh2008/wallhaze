import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import ContentShell from "@/components/pages/ContentShell";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

/**
 * /terms (FE09): effective Terms of Service. Public, indexable, no sign-in
 * required. Governs the free gallery, per-work download permissions,
 * community submissions, the AI Studio and Credits. Jurisdiction and
 * operating-entity details are intentionally not claimed — see the delivery
 * report's manual-confirmation list.
 */
const TERMS_PATH = "/terms";

/** Section ids render in order; lists come from the *Items message arrays. */
const TERMS_SECTIONS = [
  { id: "acceptance", hasList: false },
  { id: "service", hasList: false },
  { id: "account", hasList: false },
  { id: "submissions", hasList: false },
  { id: "ip", hasList: false },
  { id: "downloads", hasList: false },
  { id: "prohibited", hasList: true },
  { id: "ai", hasList: false },
  { id: "credits", hasList: false },
  { id: "review", hasList: false },
  { id: "availability", hasList: false },
  { id: "liability", hasList: false },
  { id: "termination", hasList: false },
  { id: "changes", hasList: false },
  { id: "contact", hasList: false },
] as const;

/** Message arrays arrive as unknown — narrow to a clean string list. */
function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

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

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-clip">
      <Header />
      <ContentShell eyebrow={t("eyebrow")} title={t("title")} subtitle={t("intro")}>
        <p className="text-sm text-zinc-500">{t("updated")}</p>
        <dl className="mt-8 space-y-10">
          {TERMS_SECTIONS.map(({ id, hasList }) => (
            <div key={id}>
              <dt className="text-lg font-semibold tracking-tight text-zinc-100">
                {t(`${id}Title` as const)}
              </dt>
              <dd className="mt-3 leading-relaxed text-zinc-400">
                <p>{t(`${id}Body` as const)}</p>
                {hasList ? (
                  <ul className="mt-4 list-disc space-y-3 pl-5 marker:text-violet-400/70">
                    {stringList(t.raw(`${id}Items`)).map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </ContentShell>
      <Footer />
    </div>
  );
}
