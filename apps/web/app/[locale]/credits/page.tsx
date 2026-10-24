import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import CreditsClient from "@/components/credits/CreditsClient";

/**
 * /credits (FE06 → R07): the Credits center.
 *
 * The live panel reads the backend wallet, packages, ledger and orders when
 * a session exists. Without a configured backend (or while signed out) the
 * page shows its honest not-connected copy — no fake balance, no fake price.
 * Checkout availability is decided by the backend's pricing response and is
 * rendered by the client panel; this page makes no static claim about it.
 * Account-private: noindex.
 */
const CREDITS_PATH = "/credits";

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
    path: CREDITS_PATH,
    title: t("creditsTitle"),
    description: t("creditsDescription"),
    noindex: true,
  });
}

export default async function CreditsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const t = await getTranslations("wallet");

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-clip">
      <Header maxWidthClassName="max-w-[1120px]" />
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-6 pb-20 pt-24 md:pt-28">
        <p className="inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
          <span className="h-px w-8 bg-gradient-to-r from-violet-400 to-transparent" />
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
          {t("subtitle")}
        </p>

        {/* Live wallet panel: real data, or the honest not-connected copy. */}
        <CreditsClient locale={locale} />

        <section
          aria-labelledby="wallet-faq"
          className="mt-12 scroll-mt-28"
        >
          <h2 id="wallet-faq" className="text-xl font-semibold">
            {t("faqTitle")}
          </h2>
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((n) => (
              <details
                key={n}
                className="group rounded-2xl border border-white/10 bg-white/[0.02]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-violet-300 [&::-webkit-details-marker]:hidden">
                  {t(`faq${n}Q` as const)}
                  <span
                    aria-hidden
                    className="shrink-0 text-zinc-500 transition group-open:rotate-180"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-4 w-4"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </summary>
                <div className="border-t border-white/5 px-5 py-4 text-sm leading-relaxed text-zinc-400">
                  {t(`faq${n}A` as const)}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Checkout availability lives in the client panel above, driven by
            the backend's pricing response. A static "restricted" banner here
            would contradict a deployment whose provider is configured. */}
      </main>
      <Footer />
    </div>
  );
}
