import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import AuthPanel, { LoginPanel } from "@/components/auth/AuthPanel";

/**
 * /login (FE05): account entry page. No Auth backend exists yet — the panel
 * renders an honest, structurally disabled state; credentials are never
 * collected. Account-private page: excluded from search indexes.
 */
const LOGIN_PATH = "/login";

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
    path: LOGIN_PATH,
    title: t("loginTitle"),
    description: t("loginDescription"),
    noindex: true,
  });
}

export default async function LoginPage({
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
          {/* Query-string reads (next / oauthError) are isolated in a client
              shell so this page remains statically prerenderable. */}
          <Suspense fallback={<AuthPanel mode="login" />}>
            <LoginPanel />
          </Suspense>
        </div>
      </main>
      <Footer />
    </div>
  );
}
