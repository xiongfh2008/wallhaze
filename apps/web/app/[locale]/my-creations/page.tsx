import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import MyCreationsClient from "@/components/creations/MyCreationsClient";
import CloudCreations from "@/components/creations/CloudCreations";

/**
 * /my-creations (FE07 → R07): account cloud creations (when signed in)
 * followed by the device-local generation history. The two sources are
 * labeled separately — local records are never presented as cloud data.
 * Account-private page: excluded from search indexes.
 */
const MY_CREATIONS_PATH = "/my-creations";

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
    path: MY_CREATIONS_PATH,
    title: t("myCreationsTitle"),
    description: t("myCreationsDescription"),
    noindex: true,
  });
}

export default async function MyCreationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const t = await getTranslations("creations");

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-clip">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-20 pt-28 md:pt-32">
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

        <CloudCreations />
        <MyCreationsClient />
      </main>
      <Footer />
    </div>
  );
}
