import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import AuthPanel from "@/components/auth/AuthPanel";

/**
 * /signup (FE05): registration entry page. No Auth backend exists yet —
 * same honest, structurally disabled state as /login; credentials are never
 * collected. Account-private page: excluded from search indexes.
 */
const SIGNUP_PATH = "/signup";

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
    path: SIGNUP_PATH,
    title: t("signupTitle"),
    description: t("signupDescription"),
    noindex: true,
  });
}

export default async function SignupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-clip">
      <Header />
      <main className="flex w-full flex-1 justify-center px-6 pb-20 pt-28 md:pt-32">
        <div className="w-full max-w-md">
          <AuthPanel mode="signup" />
        </div>
      </main>
      <Footer />
    </div>
  );
}
