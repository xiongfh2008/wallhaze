import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  PRESET_WALLPAPERS,
  getRelatedWallpapers,
  getWallpaperBySlug,
  styleCategoryOf,
} from "@/lib/wallpapers";
import {
  absoluteLocaleUrl,
  languageAlternates,
  OG_LOCALE,
  SITE_URL,
} from "@/lib/seo";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import WallpaperDownloadButton from "@/components/WallpaperDownloadButton";
import { WallpaperLinkCard } from "@/components/FeaturedWallpapers";
import WallpaperImage from "@/components/WallpaperImage";

/**
 * /wallpapers/[slug] — static detail page for one preset wallpaper.
 * Everything renders from lib/wallpapers.ts + the localized messages; the
 * slug IS the stable preset id, so URLs are permanent and shareable.
 *
 * Honesty rules:
 * - Only fields that actually exist are shown (title, style, family,
 *   description). No fake dimensions, view counts or download counts.
 * - Every wallpaper ships with license "review-pending" until individually
 *   audited — the UI shows exactly that, never "commercial use allowed".
 * - Localized titles/alt texts fall back to the English source when a
   translation is missing (never machine-fabricated copy).
 */

interface DetailPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export function generateStaticParams() {
  // Slugs only — the locale segment comes from the parent layout.
  return PRESET_WALLPAPERS.map((wallpaper) => ({ slug: wallpaper.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const wallpaper = getWallpaperBySlug(slug);
  if (!wallpaper) return {};

  // English source strings are the fallback policy for per-wallpaper copy;
  // translations exist for all 39 presets today and are used when present.
  const tWallpapers = await getTranslations("galleryWallpapers");
  const titleKey = `${wallpaper.id}.title`;
  const altKey = `${wallpaper.id}.alt`;
  const title = tWallpapers.has(titleKey)
    ? tWallpapers(titleKey)
    : wallpaper.title;
  const description = tWallpapers.has(altKey)
    ? tWallpapers(altKey)
    : wallpaper.alt;
  const seoTitle = `${title} — Free AI Wallpaper`;

  const path = `/wallpapers/${wallpaper.id}`;

  return {
    title: seoTitle,
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
      title: seoTitle,
      description,
      images: [{ url: wallpaper.image, alt: description }],
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description,
      images: [{ url: wallpaper.image, alt: description }],
    },
  };
}

export default async function WallpaperDetailPage({ params }: DetailPageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const wallpaper = getWallpaperBySlug(slug);
  if (!wallpaper) {
    notFound();
  }

  const tWallpapers = await getTranslations("galleryWallpapers");
  const tStyles = await getTranslations("styleLabels");
  const tGroups = await getTranslations("groupLabels");
  const t = await getTranslations("detail");

  const titleKey = `${wallpaper.id}.title`;
  const altKey = `${wallpaper.id}.alt`;
  const title = tWallpapers.has(titleKey)
    ? tWallpapers(titleKey)
    : wallpaper.title;
  const description = tWallpapers.has(altKey)
    ? tWallpapers(altKey)
    : wallpaper.alt;

  const category = styleCategoryOf(wallpaper.styleId);
  const categoryLabel = category
    ? tGroups(category)
    : t("categoryFallback");
  const styleLabel = tStyles(wallpaper.styleId);

  const related = getRelatedWallpapers(wallpaper.id, 8);

  // JSON-LD ImageObject — only factual fields; no license/dimensions claims
  // while the per-wallpaper license review is still pending.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    name: title,
    description,
    contentUrl: wallpaper.image.startsWith("http")
      ? wallpaper.image
      : `${SITE_URL}${wallpaper.image}`,
    url: absoluteLocaleUrl(locale, `/wallpapers/${wallpaper.id}`),
    creditText: "WallHaze",
    creator: { "@type": "Organization", name: "WallHaze" },
    isAccessibleForFree: true,
  };

  return (
    <div className="relative flex-1 overflow-x-clip">
      <Header />
      <main className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-28 md:pb-32 md:pt-36">
        {/* Back to gallery — the first focusable page element */}
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
          {t("backToGallery")}
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
          {/* Large artwork — fixed aspect box prevents layout shift; the
              image is contained, never cropped. */}
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br shadow-2xl shadow-black/50 lg:sticky lg:top-28 lg:self-start">
            <div className={`absolute inset-0 bg-gradient-to-br ${wallpaper.gradient} opacity-40`} />
            <WallpaperImage
              src={wallpaper.image}
              alt={description}
              gradient={wallpaper.gradient}
              eager
              priority
              className="h-full w-full object-contain"
            />
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
              {categoryLabel}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              {title}
            </h1>
            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-zinc-500">
                  {t("styleLabel")}
                </dt>
                <dd className="text-zinc-200">{styleLabel}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-zinc-500">
                  {t("familyLabel")}
                </dt>
                <dd className="text-zinc-200">{categoryLabel}</dd>
              </div>
            </dl>

            <p className="mt-6 leading-relaxed text-zinc-400">
              {description}
            </p>

            {/* Licensing: honest per-wallpaper status, never auto-approved. */}
            <div className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-950/20 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="h-4 w-4 shrink-0"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                {wallpaper.license === "verified"
                  ? t("licenseVerified")
                  : t("licenseBadge")}
              </p>
              {wallpaper.license !== "verified" && (
                <p className="mt-2 text-xs leading-relaxed text-amber-200/70">
                  {t("licenseNotice")}
                </p>
              )}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <WallpaperDownloadButton
                wallpaperId={wallpaper.id}
                title={title}
                image={wallpaper.image}
              />
              <Link
                href={`/studio?style=${wallpaper.styleId}`}
                className="rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-medium text-zinc-100 backdrop-blur transition hover:border-white/35 hover:bg-white/10"
              >
                {t("createSimilar")}
              </Link>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-20 md:mt-28" aria-labelledby="related-heading">
            <h2
              id="related-heading"
              className="text-2xl font-semibold tracking-tight md:text-3xl"
            >
              {t("relatedTitle")}
            </h2>
            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
              {related.map((item) => (
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
                  viewLabel={t("relatedCardAria", {
                    title: tWallpapers.has(`${item.id}.title`)
                      ? tWallpapers(`${item.id}.title`)
                      : item.title,
                  })}
                />
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
      <script
        type="application/ld+json"
        // Static JSON derived from validated static data — no user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
