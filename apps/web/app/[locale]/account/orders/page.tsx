import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import Button from "@/components/ui/Button";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import OrdersPanel from "@/components/credits/OrdersPanel";
import { loginHref } from "@/lib/auth/return-to";

/**
 * /account/orders (FE08 → R06/R07). The live panel lists the signed-in
 * user's provider-neutral orders; signed-out or unconfigured visitors see
 * the honest unavailable state. No order is ever displayed as paid unless
 * the backend says so.
 */
const ORDERS_PATH = "/account/orders";

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
    path: ORDERS_PATH,
    title: t("accountTitle"),
    description: t("accountDescription"),
    noindex: true,
  });
}

export default async function AccountOrdersPage({
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
          {t("ordersSectionTitle")}
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-zinc-400">
          {t("ordersSectionBody")}
        </p>

        <div
          role="status"
          className="mt-8 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm leading-relaxed text-amber-200"
        >
          {t("ordersUnavailableNotice")}
        </div>

        <OrdersPanel locale={locale} />

        {/* Signed-out guidance (only relevant when signed out). */}
        <section
          aria-labelledby="orders-signin"
          className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8"
        >
          <h2 id="orders-signin" className="text-lg font-semibold">
            {t("signInRequiredTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {t("signInRequiredBody")}
          </p>
          <div className="mt-4">
            <Button href={loginHref("/account/orders")} variant="secondary">
              {t("signInAction")}
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
