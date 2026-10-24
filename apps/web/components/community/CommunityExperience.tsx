"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import CommunityCard from "./CommunityCard";
import { submissionMailto, type CommunityWork } from "@/lib/community";
import { DEVICE_ORDER, type DeviceCategory } from "@/lib/media";
import { WALLPAPER_STYLES, type StyleId } from "@/lib/styles";

type MediaFilter = "all" | "image" | "video";
type DeviceFilter = "all" | DeviceCategory;
type StyleFilter = "all" | StyleId;

function matches(
  work: CommunityWork,
  media: MediaFilter,
  device: DeviceFilter,
  style: StyleFilter
): boolean {
  if (media !== "all" && work.mediaType !== media) return false;
  if (device !== "all" && work.deviceType !== device) return false;
  if (style !== "all" && work.styleId !== style) return false;
  return true;
}

function CardGrid({ works }: { works: readonly CommunityWork[] }) {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
      {works.map((work, index) => (
        <div key={work.id} className="mb-4 break-inside-avoid">
          <CommunityCard work={work} priority={index < 3} />
        </div>
      ))}
    </div>
  );
}

/**
 * Community filter shell over REAL user submissions. In demo mode the server
 * additionally passes demo seed works; they render in the same grids but are
 * always badged as simulated samples and never counted as submissions.
 */
export default function CommunityExperience({
  submissionWorks,
  demoWorks = [],
}: {
  submissionWorks: readonly CommunityWork[];
  demoWorks?: readonly CommunityWork[];
}) {
  const t = useTranslations("community");
  const tDevices = useTranslations("devices");
  const tStyles = useTranslations("styleLabels");
  const [media, setMedia] = useState<MediaFilter>("all");
  const [device, setDevice] = useState<DeviceFilter>("all");
  const [style, setStyle] = useState<StyleFilter>("all");

  const listing = useMemo(() => {
    const combined = [...submissionWorks, ...demoWorks];
    return combined
      .filter((work) => matches(work, media, device, style))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }, [submissionWorks, demoWorks, media, device, style]);
  const featured = listing.filter((work) => work.featured);
  const latest = listing.filter((work) => !work.featured);
  const hasFilters = media !== "all" || device !== "all" || style !== "all";
  const total = listing.length;

  return (
    <div>
      <div className="mb-8 rounded-2xl border border-white/10 bg-black/25 p-3 md:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {t("filtersMediaAria")}
            </span>
            <div
              role="group"
              aria-label={t("filtersMediaAria")}
              className="flex flex-wrap gap-1"
            >
              {(
                [
                  ["all", t("allMedia")],
                  ["image", t("staticMedia")],
                  ["video", t("liveMedia")],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={media === id}
                  onClick={() => setMedia(id)}
                  className={`min-h-9 rounded-full border px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                    media === id
                      ? "border-violet-400/70 bg-violet-500/20 text-white"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {t("filtersDeviceAria")}
            </span>
            <div
              role="group"
              aria-label={t("filtersDeviceAria")}
              className="flex flex-wrap gap-1"
            >
              <button
                type="button"
                aria-pressed={device === "all"}
                onClick={() => setDevice("all")}
                className={`min-h-9 rounded-full border px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                  device === "all"
                    ? "border-violet-400/70 bg-violet-500/20 text-white"
                    : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                }`}
              >
                {t("allDevices")}
              </button>
              {DEVICE_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={device === id}
                  onClick={() => setDevice(id)}
                  className={`min-h-9 rounded-full border px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                    device === id
                      ? "border-violet-400/70 bg-violet-500/20 text-white"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                  }`}
                >
                  {tDevices(id)}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2">
              <span className="sr-only">{t("filtersStyleAria")}</span>
              <select
                value={style}
                onChange={(event) => setStyle(event.target.value as StyleFilter)}
                aria-label={t("filtersStyleAria")}
                className="min-h-9 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-200 outline-none transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="all">{t("allStyles")}</option>
                {WALLPAPER_STYLES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {tStyles(item.id)}
                  </option>
                ))}
              </select>
            </label>

            {hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setMedia("all");
                  setDevice("all");
                  setStyle("all");
                }}
                className="min-h-9 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/25 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
              >
                {t("resetFilters")}
              </button>
            ) : null}
            <span className="text-xs text-zinc-500" aria-live="polite">
              {t("resultCount", { count: total })}
            </span>
          </div>
        </div>
      </div>

      <section
        id="community-creations"
        aria-labelledby="community-creations-title"
        className="mt-16 border-t border-white/10 pt-10 md:mt-20"
      >
        <div className="mb-5 max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-200/80">
            {t("submissionBadge")}
          </p>
          <h2
            id="community-creations-title"
            className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl"
          >
            {t("submissionsTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {t("submissionsSubtitle")}
          </p>
        </div>

        {demoWorks.length > 0 ? (
          <p className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-950/20 px-4 py-3 text-xs leading-relaxed text-amber-100/90">
            {t("demoBanner")}
          </p>
        ) : null}

        {submissionWorks.length === 0 && demoWorks.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-violet-950/30 via-black to-emerald-950/20 p-8 text-center md:p-12">
            <h3 className="text-xl font-semibold text-white">
              {t("emptyTitle")}
            </h3>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-zinc-400">
              {t("emptyBody")}
            </p>
            <a
              href={submissionMailto()}
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-2.5 text-sm font-semibold text-white outline-none transition hover:from-violet-500 hover:to-fuchsia-500 focus-visible:ring-2 focus-visible:ring-violet-300/80"
            >
              {t("emptyCta")}
            </a>
          </div>
        ) : listing.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
            <p className="text-sm font-medium text-zinc-200">
              {t("noResultsTitle")}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{t("noResultsBody")}</p>
          </div>
        ) : (
          <div className="space-y-10">
            {featured.length > 0 ? (
              <div>
                <h3 className="mb-4 text-lg font-semibold">
                  {t("featuredTitle")}
                </h3>
                <CardGrid works={featured} />
              </div>
            ) : null}
            {latest.length > 0 ? (
              <div>
                <h3 className="mb-4 text-lg font-semibold">
                  {t("latestTitle")}
                </h3>
                <CardGrid works={latest} />
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
