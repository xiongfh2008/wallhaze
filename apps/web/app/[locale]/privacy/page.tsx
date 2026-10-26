import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import ContentShell from "@/components/pages/ContentShell";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

/**
 * /privacy (FE09): effective Privacy Policy. Public, indexable, no sign-in
 * required. It documents the data WallHaze actually processes — email and
 * password accounts, Google sign-in (openid/email/profile), generations,
 * Credits, session cookies, device-local storage — and the verified contact
 * channel. Legal-review notes live in the delivery report, not on the page.
 */
const PRIVACY_PATH = "/privacy";

/** Section ids render in order; lists come from the *Items message arrays. */
const PRIVACY_SECTIONS = [
  { id: "intro", hasList: false },
  { id: "collect", hasList: true },
  { id: "google", hasList: true },
  { id: "cookies", hasList: false },
  { id: "use", hasList: true },
  { id: "thirdParty", hasList: true },
  { id: "retention", hasList: true },
  { id: "security", hasList: false },
  { id: "rights", hasList: false },
  { id: "children", hasList: false },
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
    path: PRIVACY_PATH,
    title: t("privacyTitle"),
    description: t("privacyDescription"),
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

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-clip">
      <Header />
      <ContentShell eyebrow={t("eyebrow")} title={t("title")} subtitle={t("intro")}>
        <p className="text-sm text-zinc-500">{t("updated")}</p>
        <dl className="mt-8 space-y-10">
          {PRIVACY_SECTIONS.map(({ id, hasList }) => (
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
                {id === "use" ? (
                  <p className="mt-4">{t("useNote")}</p>
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
