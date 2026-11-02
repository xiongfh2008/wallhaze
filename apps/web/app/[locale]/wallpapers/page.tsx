import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { absoluteLocaleUrl, languageAlternates, OG_LOCALE } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { PRESET_WALLPAPERS } from "@/lib/wallpapers";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import GalleryExperience from "@/components/gallery/GalleryExperience";

/**
 * /wallpapers — the full, filterable gallery over the static preset list.
 * Static page shell + one client browser component (search, filters, sort,
 * favorites, downloads, load-more).
 */

const PATH = "/wallpapers";

export async function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    title: t("wallpapersTitle"),
    description: t("wallpapersDescription"),
    alternates: {
      canonical: absoluteLocaleUrl(locale, PATH),
      languages: languageAlternates(PATH),
    },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale],
      url: absoluteLocaleUrl(locale, PATH),
      siteName: "WallHaze",
      title: t("wallpapersTitle"),
      description: t("wallpapersDescription"),
    },
    twitter: {
      card: "summary_large_image",
      title: t("wallpapersTitle"),
      description: t("wallpapersDescription"),
    },
  };
}

export default async function WallpapersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const tGallery = await getTranslations("gallery");
  const tMeta = await getTranslations("meta");
  const tWallpapers = await getTranslations("galleryWallpapers");

  // Server-rendered crawlable index of every publicly viewable wallpaper.
  // The client browser above renders its list progressively (search, filters,
  // load-more), so without this section most detail pages have no crawlable
  // inbound link from the gallery.
  const publicWallpapers = PRESET_WALLPAPERS.filter(
    (wallpaper) => wallpaper.canPubliclyDisplay
  ).sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div className="relative flex-1 overflow-x-clip">
      <Header />
      <main className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-28 md:pb-32 md:pt-36">
        <div className="mb-10 max-w-2xl md:mb-12">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
            {tGallery("eyebrow")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
            {tGallery("title")}
          </h1>
          <p className="mt-4 leading-relaxed text-zinc-400">
            {tGallery("pageSubtitle")}
          </p>
        </div>
        <GalleryExperience />

        <section
          className="mt-20 border-t border-white/10 pt-10"
          aria-labelledby="all-wallpapers-heading"
        >
          <h2
            id="all-wallpapers-heading"
            className="text-xl font-semibold tracking-tight"
          >
            {tMeta("allWallpapersTitle")}
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            {tMeta("allWallpapersHint")}
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {publicWallpapers.map((wallpaper) => {
              const titleKey = `${wallpaper.id}.title`;
              const title = tWallpapers.has(titleKey)
                ? tWallpapers(titleKey)
                : wallpaper.title;
              return (
                <li key={wallpaper.id}>
                  <Link
                    href={`/wallpapers/${wallpaper.id}`}
                    className="text-zinc-400 transition hover:text-white"
                  >
                    {title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
      <Footer />
    </div>
  );
}
