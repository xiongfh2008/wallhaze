import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  WALLPAPER_COLLECTIONS,
  getCollection,
  getCollectionWallpapers,
} from "@/lib/collections";
import {
  absoluteLocaleUrl,
  languageAlternates,
  OG_LOCALE,
} from "@/lib/seo";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { WallpaperLinkCard } from "@/components/FeaturedWallpapers";

/**
 * /wallpapers/collections/[collection] — curated thematic gallery pages
 * (currently: Dreamcore, Anime). Only collection slugs whitelisted in
 * lib/collections.ts render; unknown slugs 404. Membership is derived from
 * the public wallpaper list, so a collection can never reference artwork
 * that is not cleared for public display.
 *
 * The route is a static segment ("collections") and therefore resolves
 * before /wallpapers/[slug]; no preset slug is named "collections", so
 * there is no URL conflict with detail pages.
 */

interface CollectionPageProps {
  params: Promise<{ locale: string; collection: string }>;
}

export function generateStaticParams() {
  return WALLPAPER_COLLECTIONS.map((collection) => ({
    collection: collection.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; collection: string }>;
}): Promise<Metadata> {
  const { locale, collection: slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const collection = getCollection(slug);
  if (!collection) return {};
  const t = await getTranslations("collections");
  const metaTitleKey = `${collection.slug}.metaTitle`;
  const metaDescriptionKey = `${collection.slug}.metaDescription`;
  const title = t.has(metaTitleKey) ? t(metaTitleKey) : t(`${collection.slug}.title`);
  const description = t.has(metaDescriptionKey)
    ? t(metaDescriptionKey)
    : t(`${collection.slug}.intro`);

  const path = `/wallpapers/collections/${collection.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: absoluteLocaleUrl(locale, path),
      languages: languageAlternates(path),
    },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale],
      url: absoluteLocaleUrl(locale, path),
      siteName: "WallHaze",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function WallpaperCollectionPage({
  params,
}: CollectionPageProps) {
  const { locale, collection: slug } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const collection = getCollection(slug);
  if (!collection) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations("collections");
  const tWallpapers = await getTranslations("galleryWallpapers");
  const tStyles = await getTranslations("styleLabels");
  const tDetail = await getTranslations("detail");
  const tMeta = await getTranslations("meta");

  const titleKey = `${collection.slug}.title`;
  const introKey = `${collection.slug}.intro`;
  const title = t.has(titleKey) ? t(titleKey) : collection.slug;
  const intro = t.has(introKey) ? t(introKey) : "";
  const wallpapers = getCollectionWallpapers(collection);

  // Real hierarchy only: Home → Wallpapers → this collection.
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: tMeta("breadcrumbHome"),
        item: absoluteLocaleUrl(locale, "/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: tMeta("breadcrumbWallpapers"),
        item: absoluteLocaleUrl(locale, "/wallpapers"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: title,
        item: absoluteLocaleUrl(locale, `/wallpapers/collections/${collection.slug}`),
      },
    ],
  };

  return (
    <div className="relative flex-1 overflow-x-clip">
      <Header />
      <main className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-28 md:pb-32 md:pt-36">
        <Link
          href="/wallpapers"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="h-4 w-4"
          >
            <path d="M19 12H5m6-6-6 6 6 6" />
          </svg>
          {tDetail("backToGallery")}
        </Link>

        <div className="mt-8 max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
            {t("browseLabel")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 leading-relaxed text-zinc-400">{intro}</p>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6">
          {wallpapers.map((item) => (
            <WallpaperLinkCard
              key={item.id}
              wallpaper={item}
              title={tWallpapers.has(`${item.id}.title`)
                ? tWallpapers(`${item.id}.title`)
                : item.title}
              alt={tWallpapers.has(`${item.id}.alt`)
                ? tWallpapers(`${item.id}.alt`)
                : item.alt}
              styleLabel={tStyles(item.styleId)}
              reviewLabel={tDetail("imageRestrictedShort")}
              viewLabel={tDetail("relatedCardAria", {
                title: tWallpapers.has(`${item.id}.title`)
                  ? tWallpapers(`${item.id}.title`)
                  : item.title,
              })}
            />
          ))}
        </div>
      </main>
      <Footer />
      <script
        type="application/ld+json"
        // Static JSON derived from validated static data — no user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
    </div>
  );
}
