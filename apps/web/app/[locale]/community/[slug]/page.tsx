import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  absoluteLocaleUrl,
  languageAlternates,
  OG_LOCALE,
  SITE_URL,
} from "@/lib/seo";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WallpaperImage from "@/components/WallpaperImage";
import WallpaperDownloadButton from "@/components/WallpaperDownloadButton";
import LiveVideoPlayer from "@/components/studio/LiveVideoPlayer";
import CommunityCard from "@/components/community/CommunityCard";
import {
  getCommunityWorkBySlug,
  getCommunityWorks,
  getRelatedCommunityWorks,
  reportMailto,
  type CommunityLicenseType,
  type CommunitySourceType,
  type CommunityDownloadScope,
} from "@/lib/community";
import {
  getDemoWorkBySlug,
  getDemoWorks,
  isCommunityDemoMode,
} from "@/lib/community/demo";
import { formatAspectRatio } from "@/lib/media";

const LICENSE_KEY: Record<CommunityLicenseType, string> = {
  "CC0-1.0": "cc0",
  "CC-BY-4.0": "ccBy",
  "CC-BY-SA-4.0": "ccBySa",
  "self-authored": "selfAuthored",
  "personal-use": "personalUse",
  "all-rights-reserved": "allRightsReserved",
  custom: "custom",
};

const CREATION_KEY: Record<CommunitySourceType, string> = {
  original: "original",
  "ai-assisted": "aiAssisted",
  "ai-generated": "aiGenerated",
  "demo-local-cc0": "demoLocalCc0",
  "demo-local-self": "demoLocalSelf",
};

const DOWNLOAD_SCOPE_KEY: Record<CommunityDownloadScope, string> = {
  cc0: "cc0",
  "self-authored": "selfAuthored",
  "personal-use": "personalUse",
  custom: "custom",
};

/**
 * Real submission pages only. Demo seed pages are generated exclusively in
 * demo-mode (dev) builds; a production build contains no demo routes.
 */
export function generateStaticParams() {
  const slugs = getCommunityWorks().map((work) => ({ slug: work.slug }));
  if (!isCommunityDemoMode()) {
    // Next.js errors on an empty params array; a demo-less build still needs
    // one placeholder entry for the [locale] shell (it 404s on render).
    return slugs.length > 0 ? slugs : [{ slug: "placeholder" }];
  }
  return [...slugs, ...getDemoWorks().map((work) => ({ slug: work.slug }))];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const work = getCommunityWorkBySlug(slug);
  if (!work) return {};

  const tAll = await getTranslations();
  const tCommunity = await getTranslations({ locale, namespace: "community" });
  const title = work.titleKey ? tAll(work.titleKey) : work.title;
  const description = work.descriptionKey
    ? tAll(work.descriptionKey)
    : work.description;
  const path = `/community/${work.slug}`;
  const image =
    work.mediaType === "video" ? work.posterAsset : work.previewAsset;
  const seoTitle = `${title} — ${tCommunity("metaTitleSuffix")}`;

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

export default async function CommunityWorkPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const work =
    getCommunityWorkBySlug(slug) ??
    (isCommunityDemoMode() ? getDemoWorkBySlug(slug) : undefined);
  if (!work) notFound();
  const demo = work.origin === "demo_seed";

  const tAll = await getTranslations();
  const t = await getTranslations("community");
  const tDetail = await getTranslations("community.detail");
  const tStyles = await getTranslations("styleLabels");
  const tDevices = await getTranslations("devices");

  const title = work.titleKey ? tAll(work.titleKey) : work.title;
  const description = work.descriptionKey
    ? tAll(work.descriptionKey)
    : work.description;
  const authorName = work.author.nameKey
    ? tAll(work.author.nameKey)
    : work.author.name;
  const authorBio = work.author.bioKey
    ? tAll(work.author.bioKey)
    : work.author.bio;
  const sourceDescription = work.sourceDescriptionKey
    ? tAll(work.sourceDescriptionKey)
    : work.sourceDescription;
  const licenseLabel = t(`licenses.${LICENSE_KEY[work.licenseType]}`);
  const creationLabel = t(`creation.${CREATION_KEY[work.sourceType]}`);
  const scopeLabel = t(
    `downloadScopes.${DOWNLOAD_SCOPE_KEY[work.downloadScope]}`
  );
  const ratioLabel = formatAspectRatio(work.width, work.height);
  const portrait = work.height > work.width;
  const publicUrl = absoluteLocaleUrl(locale, `/community/${work.slug}`);
  const downloadAsset = work.downloadAsset;
  const related = getRelatedCommunityWorks(work, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: title,
    description,
    url: publicUrl,
    datePublished: work.publishedAt,
    creator: { "@type": "Person", name: work.author.name },
    license: work.licenseUrl ?? undefined,
    encodingFormat: work.mediaType === "video" ? "video/mp4" : "image/jpeg",
    ...(work.mediaType === "video" && work.posterAsset
      ? { thumbnailUrl: `${SITE_URL}${work.posterAsset}` }
      : { image: `${SITE_URL}${work.previewAsset}` }),
    ...(downloadAsset ? { contentUrl: `${SITE_URL}${downloadAsset}` } : {}),
  };

  return (
    <div className="relative flex-1 overflow-x-clip">
      <Header />
      <main className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-28 md:pb-32 md:pt-36">
        <Link
          href="/community"
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
          {tDetail("back")}
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
          <div className="flex w-full justify-center lg:sticky lg:top-28 lg:self-start">
            <div
              className={`relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/50 ${
                portrait ? "max-w-[26rem]" : ""
              }`}
              style={{ aspectRatio: `${work.width} / ${work.height}` }}
            >
              {work.mediaType === "video" ? (
                <LiveVideoPlayer
                  src={work.previewAsset}
                  poster={work.posterAsset}
                  durationSeconds={work.durationSeconds}
                  label={title}
                  fit="contain"
                />
              ) : (
                <WallpaperImage
                  src={work.previewAsset}
                  alt={description}
                  gradient="from-violet-950 via-purple-950 to-black"
                  eager
                  priority
                  className="h-full w-full object-contain"
                />
              )}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ${
                  demo
                    ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
                    : "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                }`}
              >
                {demo ? t("demoBadge") : t("submissionBadge")}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-zinc-300">
                {work.mediaType === "video"
                  ? t("liveMedia")
                  : t("staticMedia")}
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              {title}
            </h1>

            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              {work.author.avatarAsset ? (
                <WallpaperImage
                  src={work.author.avatarAsset}
                  alt={authorName}
                  gradient="from-violet-700 to-fuchsia-700"
                  className="h-11 w-11 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-sm font-semibold text-white">
                  {authorName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {authorName}
                </p>
                {authorBio ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                    {authorBio}
                  </p>
                ) : null}
                {work.author.socialUrl ? (
                  <a
                    href={work.author.socialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex text-xs text-violet-300 underline-offset-4 hover:underline"
                  >
                    {tDetail("authorLink")}
                  </a>
                ) : null}
              </div>
            </div>

            <p className="mt-6 leading-relaxed text-zinc-400">{description}</p>

            {demo ? (
              <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-100/90">
                {t("demoDetailNote")}
              </p>
            ) : (
              <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-950/15 px-3 py-2 text-xs leading-relaxed text-emerald-100/85">
                {t("submissionNote")}
              </p>
            )}

            <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-zinc-500">
                  {tDetail("styleLabel")}
                </dt>
                <dd className="mt-0.5 text-zinc-200">
                  {tStyles(work.styleId)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-zinc-500">
                  {tDetail("deviceLabel")}
                </dt>
                <dd className="mt-0.5 text-zinc-200">
                  {tDevices(work.deviceType)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-zinc-500">
                  {tDetail("dimensionsLabel")}
                </dt>
                <dd className="mt-0.5 text-zinc-200">
                  {work.width} × {work.height} · {ratioLabel}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-zinc-500">
                  {tDetail("typeLabel")}
                </dt>
                <dd className="mt-0.5 text-zinc-200">
                  {work.mediaType === "video"
                    ? t("liveMedia")
                    : t("staticMedia")}
                </dd>
              </div>
              {work.mediaType === "video" ? (
                <div>
                  <dt className="text-xs font-medium text-zinc-500">
                    {tDetail("durationLabel")}
                  </dt>
                  <dd className="mt-0.5 text-zinc-200">
                    {work.durationSeconds}s
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs font-medium text-zinc-500">
                  {tDetail("creationLabel")}
                </dt>
                <dd className="mt-0.5 text-zinc-200">{creationLabel}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-zinc-500">
                  {tDetail("licenseLabel")}
                </dt>
                <dd className="mt-0.5 text-zinc-200">
                  {work.licenseUrl ? (
                    <a
                      href={work.licenseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-white/25 underline-offset-2 hover:text-white"
                    >
                      {licenseLabel}
                    </a>
                  ) : (
                    licenseLabel
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {tDetail("sourceLabel")}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-300">
                {sourceDescription}
              </p>
            </div>

            <div className="mt-7">
              {work.allowDownload && downloadAsset ? (
                <>
                  <p className="text-xs leading-relaxed text-zinc-500">
                    {tDetail("downloadScopeLabel")}: {scopeLabel}
                  </p>
                  <p className="mt-1 max-w-lg text-xs leading-relaxed text-zinc-500">
                    {tDetail("downloadNote")}
                  </p>
                  {work.downloadScopeNote ? (
                    <p className="mt-1 max-w-lg text-xs leading-relaxed text-zinc-500">
                      {work.downloadScopeNote}
                    </p>
                  ) : null}
                  <WallpaperDownloadButton
                    wallpaperId={work.id}
                    title={title}
                    image={downloadAsset}
                    className="mt-4"
                  />
                </>
              ) : (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-950/15 p-4">
                  <p className="text-sm font-semibold text-amber-100">
                    {tDetail("viewOnlyTitle")}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-100/75">
                    {tDetail("viewOnlyBody")}
                  </p>
                </div>
              )}
            </div>

            <a
              href={reportMailto(title, publicUrl)}
              className="mt-6 inline-flex min-h-10 items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 outline-none transition hover:border-white/30 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-300/80"
            >
              {tDetail("reportCta")}
            </a>
          </div>
        </div>

        {related.length > 0 ? (
          <section className="mt-20 border-t border-white/10 pt-10">
            <h2 className="text-2xl font-semibold tracking-tight">
              {tDetail("relatedTitle")}
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <CommunityCard key={item.id} work={item} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
