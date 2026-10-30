import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

/**
 * /pricing (Waffo review): the public pricing page. Mirrors the real
 * server-side configuration (apps/api/src/business/pricing.ts,
 * video-pricing.ts, migrations/002_packages.sql):
 * - one-time packages: starter 100/$5, creator 500/$20, studio 2000/$69 USD;
 * - image generation 10 credits; I2V 5s 40; T2V 3/4/5s 40/50/60.
 * Checkout availability is decided by the backend (PAYMENT_PROVIDER), so the
 * buy buttons are static, disabled, and honestly labelled — no fake
 * purchase flow. Public, indexable, no sign-in required.
 */
const PRICING_PATH = "/pricing";

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
    path: PRICING_PATH,
    title: t("pricingTitle"),
    description: t("pricingDescription"),
  });
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const t = await getTranslations("pricing");
  const packages = t.raw("packages") as Array<{
    name: unknown;
    credits: unknown;
    price: unknown;
    note: unknown;
  }>;
  const genItems = t.raw("genItems") as Array<{
    name: unknown;
    cost: unknown;
  }>;
  const billingItems = t.raw("billingItems") as unknown[];
  const faq = t.raw("faq") as Array<{ q: unknown; a: unknown }>;

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
          {t("intro")}
        </p>

          {/* Credit packages — mirrors the backend `credit_packages` table. */}
          <section
            aria-labelledby="pricing-packages"
            className="mt-12 scroll-mt-28"
          >
            <h2
              id="pricing-packages"
              className="text-xl font-semibold tracking-tight"
            >
              {t("packagesTitle")}
            </h2>
            <p className="mt-2 text-sm text-zinc-500">{t("packagesIntro")}</p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {Array.isArray(packages)
                ? packages.map((pkg) => (
                    <div
                      key={typeof pkg.name === "string" ? pkg.name : ""}
                      className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-6"
                    >
                      <p className="text-sm font-medium uppercase tracking-wide text-violet-300">
                        {typeof pkg.name === "string" ? pkg.name : ""}
                      </p>
                      <p className="mt-3 flex items-baseline gap-1.5">
                        <span className="text-3xl font-semibold tabular-nums text-white">
                          {typeof pkg.credits === "string" ? pkg.credits : ""}
                        </span>
                        <span className="text-sm text-zinc-400">Credits</span>
                      </p>
                      <p className="mt-1 text-lg font-medium text-zinc-100">
                        {typeof pkg.price === "string" ? pkg.price : ""}
                      </p>
                      <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                        {typeof pkg.note === "string" ? pkg.note : ""}
                      </p>
                      {/* Honest checkout state: the payment provider channel
                          is not open yet, so the button is disabled. */}
                      <button
                        type="button"
                        disabled
                        className="mt-6 inline-flex min-h-10 w-full cursor-not-allowed items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-400"
                      >
                        {t("checkoutComing")}
                      </button>
                    </div>
                  ))
                : null}
            </div>
            <p className="mt-4 text-sm text-zinc-500">{t("packagesNote")}</p>
          </section>

          {/* Per-generation costs — mirrors pricing.ts / video-pricing.ts. */}
          <section
            aria-labelledby="pricing-generation"
            className="mt-12 scroll-mt-28"
          >
            <h2
              id="pricing-generation"
              className="text-xl font-semibold tracking-tight"
            >
              {t("genTitle")}
            </h2>
            <p className="mt-2 text-sm text-zinc-500">{t("genIntro")}</p>
            <ul className="mt-6 divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">
              {Array.isArray(genItems)
                ? genItems.map((item) => (
                    <li
                      key={typeof item.name === "string" ? item.name : ""}
                      className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-sm leading-relaxed text-zinc-300">
                        {typeof item.name === "string" ? item.name : ""}
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-violet-300">
                        {typeof item.cost === "string" ? item.cost : ""}
                      </span>
                    </li>
                  ))
                : null}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-zinc-500">
              {t("genNote")}
            </p>
          </section>

          <section
            aria-labelledby="pricing-billing"
            className="mt-12 scroll-mt-28"
          >
            <h2
              id="pricing-billing"
              className="text-xl font-semibold tracking-tight"
            >
              {t("billingTitle")}
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-violet-400/70">
              {Array.isArray(billingItems)
                ? billingItems.map((item, index) =>
                    typeof item === "string" ? (
                      <li key={index} className="leading-relaxed text-zinc-400">
                        {item}
                      </li>
                    ) : null
                  )
                : null}
            </ul>
          </section>

          {/* Checkout status notice. */}
          <section
            aria-labelledby="pricing-checkout"
            className="mt-12 scroll-mt-28 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-6"
          >
            <h2
              id="pricing-checkout"
              className="text-lg font-semibold text-zinc-100"
            >
              {t("checkoutTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              {t("checkoutBody")}
            </p>
          </section>

          {/* FAQ */}
          <section
            aria-labelledby="pricing-faq"
            className="mt-12 scroll-mt-28"
          >
            <h2
              id="pricing-faq"
              className="text-xl font-semibold tracking-tight"
            >
              {t("faqTitle")}
            </h2>
            <div className="mt-4 space-y-3">
              {Array.isArray(faq)
                ? faq.map((item) => {
                    const q = typeof item.q === "string" ? item.q : "";
                    return (
                      <details
                        key={q}
                        className="group rounded-2xl border border-white/10 bg-white/[0.02]"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-violet-300 [&::-webkit-details-marker]:hidden">
                          {q}
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
                          {typeof item.a === "string" ? item.a : ""}
                        </div>
                      </details>
                    );
                  })
                : null}
            </div>
          </section>
      </main>
      <Footer />
    </div>
  );
}
