import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import AccountPanel from "@/components/auth/AccountPanel";

/**
 * /account (FE05/FE08 → R03): account center. The summary panel renders the
 * real session, sign-out, or the honest signed-out / not-configured state.
 * Account-private page: excluded from search indexes.
 */
const ACCOUNT_PATH = "/account";

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
    path: ACCOUNT_PATH,
    title: t("accountTitle"),
    description: t("accountDescription"),
    noindex: true,
  });
}

export default async function AccountPage({
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
        <p className="inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
          <span className="h-px w-8 bg-gradient-to-r from-violet-400 to-transparent" />
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-zinc-400">
          {t("subtitle")}
        </p>

        {/* Live session summary (or the honest unavailable/signed-out state). */}
        <AccountPanel />

        {/* Account areas (FE08). */}
        <section aria-labelledby="account-areas" className="mt-6">
          <h2
            id="account-areas"
            className="text-sm font-semibold uppercase tracking-wider text-zinc-500"
          >
            {t("profileSectionTitle")} · {t("settingsSectionTitle")} ·{" "}
            {t("ordersSectionTitle")}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              href="/account/settings"
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-violet-400/40"
            >
              <p className="font-medium text-zinc-100 group-hover:text-white">
                {t("openSettings")}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {t("settingsSectionBody")}
              </p>
            </Link>
            <Link
              href="/account/orders"
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-violet-400/40"
            >
              <p className="font-medium text-zinc-100 group-hover:text-white">
                {t("openOrders")}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {t("ordersSectionBody")}
              </p>
            </Link>
          </div>
        </section>

        {/* Working features that need no account. */}
        <section aria-labelledby="account-without-account" className="mt-6">
          <h2
            id="account-without-account"
            className="text-sm font-semibold uppercase tracking-wider text-zinc-500"
          >
            {t("withoutAccountTitle")}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              href="/wallpapers"
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-violet-400/40"
            >
              <p className="font-medium text-zinc-100 group-hover:text-white">
                {t("exploreGalleryTitle")}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {t("exploreGalleryBody")}
              </p>
            </Link>
            <Link
              href="/studio"
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-violet-400/40"
            >
              <p className="font-medium text-zinc-100 group-hover:text-white">
                {t("openStudioTitle")}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {t("openStudioBody")}
              </p>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
