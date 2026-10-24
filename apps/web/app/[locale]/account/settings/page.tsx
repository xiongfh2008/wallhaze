import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import SettingsPanel from "@/components/auth/SettingsPanel";

/**
 * /account/settings (FE08 → R03/R08): language switching works site-wide;
 * the live panel provides real sign-out and the deletion-request lifecycle
 * (recorded server-side, cancellable, not an instant purge).
 */
const SETTINGS_PATH = "/account/settings";

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
    path: SETTINGS_PATH,
    title: t("accountTitle"),
    description: t("accountDescription"),
    noindex: true,
  });
}

export default async function AccountSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const t = await getTranslations("account");

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-clip">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-20 pt-28 md:pt-32">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {t("settingsSectionTitle")}
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-zinc-400">
          {t("settingsSectionBody")}
        </p>

        {/* Language preference — works now via the site-wide switcher. */}
        <section
          aria-labelledby="settings-language"
          className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8"
        >
          <h2 id="settings-language" className="text-lg font-semibold">
            {t("languagePreferenceLabel")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {t("languagePreferenceHint")}
          </p>
          <div className="mt-4">
            <LanguageSwitcher />
          </div>
        </section>

        {/* Live session sign-out + deletion request lifecycle. */}
        <SettingsPanel />
      </main>
      <Footer />
    </div>
  );
}
