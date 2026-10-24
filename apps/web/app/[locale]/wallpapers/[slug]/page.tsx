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
  isDownloadAllowed,
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
import WallpaperDeviceBadge from "@/components/media/WallpaperDeviceBadge";
import WallpaperDevicePreview from "@/components/media/WallpaperDevicePreview";
import { formatAspectRatio } from "@/lib/media";

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
  // translations exist for every preset today and are used when present.
  const tWallpapers = await getTranslations("galleryWallpapers");
  const titleKey = `${wallpaper.id}.title`;
  const altKey = `${wallpaper.id}.alt`;
  const title = tWallpapers.has(titleKey)
    ? tWallpapers(titleKey)
    : wallpaper.title;
  const description = tWallpapers.has(altKey)
    ? tWallpapers(altKey)
    : wallpaper.alt;
  const pending = !wallpaper.canPubliclyDisplay;
  const seoTitle = pending
    ? `${title} — Wallpaper · License Review`
    : `${title} — Free Wallpaper`;

  const path = `/wallpapers/${wallpaper.id}`;
  const image = wallpaper.image;

  return {
    title: seoTitle,
    description,
    // Pending artwork must not be indexed or exposed through social cards
    // while its display rights are unresolved.
    ...(pending ? { robots: { index: false, follow: false } } : {}),
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
      ...(image ? { images: [{ url: image, alt: description }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: seoTitle,
      description,
      ...(image ? { images: [{ url: image, alt: description }] } : {}),
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
  const ratioLabel = formatAspectRatio(wallpaper.width, wallpaper.height);
  const portrait = wallpaper.height > wallpaper.width;

  const related = getRelatedWallpapers(wallpaper.id, 8);
  const licenseLabel =
    wallpaper.license === "self-authored"
      ? t("selfAuthored")
      : wallpaper.license === "verified"
        ? t("licenseVerified")
        : t("licenseBadge");

  // JSON-LD ImageObject is emitted only for a cleared, publicly displayable
  // image. Pending pages must not leak a contentUrl to crawlers.
  const jsonLd = wallpaper.image
    ? {
        "@context": "https://schema.org",
        "@type": "ImageObject",
        name: title,
        description,
        contentUrl: wallpaper.image.startsWith("http")
          ? wallpaper.image
          : `${SITE_URL}${wallpaper.image}`,
        url: absoluteLocaleUrl(locale, `/wallpapers/${wallpaper.id}`),
        width: { "@type": "QuantitativeValue", value: wallpaper.width, unitCode: "E37" },
        height: { "@type": "QuantitativeValue", value: wallpaper.height, unitCode: "E37" },
        ...(wallpaper.source
          ? {
              creditText: wallpaper.source.author,
              license: wallpaper.source.licenseUrl ?? wallpaper.source.license,
            }
          : {}),
      }
    : null;

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
          {/* The stage uses the file's real width/height, so a portrait
              artwork is genuinely portrait — no 3:4 box, bars or crop. */}
          <div className="flex w-full justify-center lg:sticky lg:top-28 lg:self-start">
            <div
              className={`relative w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50 ${
                portrait ? "max-w-[26rem]" : ""
              }`}
              style={{ aspectRatio: `${wallpaper.width} / ${wallpaper.height}` }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${wallpaper.gradient} opacity-30`} />
              {wallpaper.image ? (
                <WallpaperImage
                  src={wallpaper.image}
                  alt={description}
                  gradient={wallpaper.gradient}
                  eager
                  priority
                  className="relative h-full w-full object-contain"
                />
              ) : (
                <div className="relative flex h-full w-full items-center justify-center p-8">
                  <p className="max-w-[18rem] text-center text-sm font-medium leading-relaxed text-amber-100/90">
                    {t("imageRestricted")}
                  </p>
                </div>
              )}
            </div>
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
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-zinc-500">
                  {t("dimensionsLabel")}
                </dt>
                <dd className="text-zinc-200">
                  {wallpaper.width} × {wallpaper.height} · {ratioLabel}
                </dd>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <dt className="shrink-0 font-medium text-zinc-500">
                  {t("nativeDeviceLabel")}
                </dt>
                <dd>
                  <WallpaperDeviceBadge
                    devices={wallpaper.nativeDevices}
                    ratio={ratioLabel}
                  />
                </dd>
              </div>
            </dl>

            <p className="mt-6 leading-relaxed text-zinc-400">
              {description}
            </p>

            {/* Licensing: honest per-wallpaper status, never auto-approved. */}
            <div
              className={`mt-8 rounded-2xl border p-4 ${
                wallpaper.license === "verified"
                  ? "border-emerald-400/20 bg-emerald-950/10"
                  : wallpaper.license === "self-authored"
                    ? "border-violet-400/20 bg-violet-950/10"
                    : "border-amber-400/20 bg-amber-950/20"
              }`}
            >
              <p
                className={`flex items-center gap-2 text-sm font-medium ${
                  wallpaper.license === "verified"
                    ? "text-emerald-200"
                    : wallpaper.license === "self-authored"
                      ? "text-violet-200"
                      : "text-amber-200"
                }`}
              >
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
                {licenseLabel}
              </p>
              {wallpaper.license === "review-pending" && (
                <p className="mt-2 text-xs leading-relaxed text-amber-200/70">
                  {t("licenseNotice")}
                </p>
              )}
              {wallpaper.source ? (
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                  {t("sourceLabel")}:{" "}
                  <a
                    href={wallpaper.source.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-white/25 underline-offset-2 hover:text-white"
                  >
                    {wallpaper.source.title}
                  </a>{" "}
                  · {wallpaper.source.author} · {wallpaper.source.license}
                </p>
              ) : null}
            </div>

            {isDownloadAllowed(wallpaper.license) ? (
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                {t("downloadOriginalNote", {
                  width: wallpaper.width,
                  height: wallpaper.height,
                })}
              </p>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {isDownloadAllowed(wallpaper.license) && wallpaper.image ? (
                <WallpaperDownloadButton
                  wallpaperId={wallpaper.id}
                  title={title}
                  image={wallpaper.image}
                />
              ) : (
                <p className="max-w-xs text-xs leading-relaxed text-amber-200/80">
                  {t("downloadRestricted")}
                </p>
              )}
              <Link
                href={`/studio?style=${wallpaper.styleId}`}
                className="rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-medium text-zinc-100 backdrop-blur transition hover:border-white/35 hover:bg-white/10"
              >
                {t("createSimilar")}
              </Link>
            </div>
          </div>
        </div>

        {wallpaper.image ? (
          <WallpaperDevicePreview
            image={wallpaper.image}
            alt={description}
            gradient={wallpaper.gradient}
            nativeDevices={wallpaper.nativeDevices}
          />
        ) : null}

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
                  reviewLabel={t("imageRestrictedShort")}
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
      {jsonLd ? (
        <script
          type="application/ld+json"
          // Static JSON derived from validated static data — no user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
    </div>
  );
}
