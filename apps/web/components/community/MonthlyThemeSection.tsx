"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import WallpaperImage from "@/components/WallpaperImage";
import CommunityCard from "./CommunityCard";
import CopyEmailButton from "./CopyEmailButton";
import type { CommunityWork } from "@/lib/community";
import { detectDeviceProfile, readScreenInfo } from "@/lib/studio/device";
import type { DeviceCategory } from "@/lib/media";
import {
  formatThemeDate,
  getActiveTheme,
  getEndedThemes,
  themeCoverIsPublic,
  themeStudioHref,
  themeSubmissionMailto,
  validRecommendedStyles,
  type CommunityTheme,
} from "@/lib/community/themes";

/**
 * Active monthly theme + past themes. The status is recomputed in the browser
 * from ISO timestamps, so a static HTML cache cannot keep a deadline CTA open
 * after it has ended. Nothing renders until the client clock is available.
 */
export default function MonthlyThemeSection({
  themes,
  featuredWorksByTheme,
}: {
  themes: readonly CommunityTheme[];
  featuredWorksByTheme: Record<string, CommunityWork[]>;
}) {
  const t = useTranslations("community.monthly");
  const tAll = useTranslations();
  const tStyles = useTranslations("styleLabels");
  const tDevices = useTranslations("devices");
  const tSubmit = useTranslations("community.submit");
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);
  const [device, setDevice] = useState<DeviceCategory | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const info = readScreenInfo();
    const profile = info ? detectDeviceProfile(info) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot browser fact after hydration
    setDevice(profile?.device ?? null);
  }, []);

  if (!now) return null;

  const active = getActiveTheme(themes, now);
  const pastThemes = getEndedThemes(themes, now).filter(
    (theme) => (featuredWorksByTheme[theme.id]?.length ?? 0) > 0
  );
  if (!active && pastThemes.length === 0) return null;

  return (
    <div className="mt-12 space-y-14">
      {active ? (
        <ActiveThemeCard
          theme={active}
          locale={locale}
          device={device}
          featured={featuredWorksByTheme[active.id] ?? []}
          t={t}
          tAll={tAll}
          tStyles={tStyles}
          tDevices={tDevices}
          tSubmit={tSubmit}
        />
      ) : null}

      {pastThemes.length > 0 ? (
        <section aria-labelledby="past-themes-title">
          <div className="mb-5 max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
              {t("pastEyebrow")}
            </p>
            <h2
              id="past-themes-title"
              className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl"
            >
              {t("pastTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              {t("pastSubtitle")}
            </p>
          </div>
          <div className="space-y-8">
            {pastThemes.map((theme) => (
              <PastTheme
                key={theme.id}
                theme={theme}
                locale={locale}
                works={featuredWorksByTheme[theme.id] ?? []}
                t={t}
                tAll={tAll}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

type ThemeTranslator = ReturnType<typeof useTranslations<"community.monthly">>;
type AnyTranslator = ReturnType<typeof useTranslations>;

function ThemeCover({
  theme,
  alt,
  className = "",
}: {
  theme: CommunityTheme;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full min-w-0 overflow-hidden aspect-[16/9] ${className}`}
    >
      {themeCoverIsPublic(theme) ? (
        <WallpaperImage
          src={theme.coverImage}
          alt={alt}
          gradient="from-violet-950 via-purple-950 to-black"
          className="h-full w-full object-cover"
          eager
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-violet-700 via-purple-900 to-black" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
    </div>
  );
}

function ActiveThemeCard({
  theme,
  locale,
  device,
  featured,
  t,
  tAll,
  tStyles,
  tDevices,
  tSubmit,
}: {
  theme: CommunityTheme;
  locale: string;
  device: DeviceCategory | null;
  featured: CommunityWork[];
  t: ThemeTranslator;
  tAll: AnyTranslator;
  tStyles: ReturnType<typeof useTranslations<"styleLabels">>;
  tDevices: ReturnType<typeof useTranslations<"devices">>;
  tSubmit: ReturnType<typeof useTranslations<"community.submit">>;
}) {
  const title = tAll(theme.titleKey);
  const description = tAll(theme.descriptionKey);
  const inspiration = tAll(theme.inspirationKey);
  const coverAlt = tAll(theme.coverAltKey);
  const styles = validRecommendedStyles(theme);
  const mailto = themeSubmissionMailto(theme, title);
  const studioHref = themeStudioHref(theme, inspiration, device);

  return (
    <section
      aria-labelledby="monthly-theme-title"
      className="overflow-hidden rounded-3xl border border-violet-400/25 bg-gradient-to-br from-violet-950/45 via-[#0b0712] to-black"
    >
      <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <ThemeCover
          theme={theme}
          alt={coverAlt}
          className="min-h-[15rem] lg:aspect-auto lg:h-full"
        />

        <div className="p-6 md:p-8 lg:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-fuchsia-300/35 bg-fuchsia-400/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-fuchsia-100">
              {t("eyebrow")}
            </span>
            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-medium text-emerald-100">
              {t("activeBadge")}
            </span>
          </div>
          <h2
            id="monthly-theme-title"
            className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl"
          >
            {title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300 md:text-base">
            {description}
          </p>

          <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-zinc-500">{t("deadlineLabel")}</dt>
              <dd className="mt-1 text-zinc-200">
                {t("dateRange", {
                  start: formatThemeDate(theme.startsAt, locale, theme.timezone),
                  end: formatThemeDate(theme.endsAt, locale, theme.timezone),
                })}
              </dd>
              <dd className="mt-0.5 text-zinc-500">
                {t("timezone", { timezone: theme.timezone })}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">{t("supportedMediaLabel")}</dt>
              <dd className="mt-1 text-zinc-200">
                {theme.supportedMediaTypes
                  .map((type) =>
                    type === "video" ? t("liveMedia") : t("staticMedia")
                  )
                  .join(" · ")}
              </dd>
              <dt className="mt-2 text-zinc-500">{t("supportedDevicesLabel")}</dt>
              <dd className="mt-1 text-zinc-200">
                {theme.supportedDevices.map((item) => tDevices(item)).join(" · ")}
              </dd>
            </div>
          </dl>

          {styles.length > 0 ? (
            <div className="mt-5">
              <p className="text-xs text-zinc-500">{t("recommendedStylesLabel")}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {styles.map((styleId) => (
                  <Link
                    key={styleId}
                    href={themeStudioHref(theme, inspiration, device, styleId)}
                    className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-200 outline-none transition hover:border-violet-300/50 hover:bg-violet-500/15 focus-visible:ring-2 focus-visible:ring-violet-300/70"
                  >
                    {tStyles(styleId)}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <p className="mt-5 text-xs leading-relaxed text-zinc-500">
            {t("submissionNote")}
          </p>

          <div className="mt-5 flex flex-wrap items-start gap-2.5">
            <a
              href={mailto}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white outline-none transition hover:from-violet-500 hover:to-fuchsia-500 focus-visible:ring-2 focus-visible:ring-violet-300/80"
            >
              {t("submitCta")}
            </a>
            <Link
              href={studioHref}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-100 outline-none transition hover:border-white/35 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-violet-300/80"
            >
              {t("studioCta")}
            </Link>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            {t("studioNote")}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <span className="text-[11px] text-zinc-500">{t("emailLabel")}</span>
            <code className="select-all break-all text-xs text-violet-100">
              {theme.submissionEmail}
            </code>
            <CopyEmailButton
              email={theme.submissionEmail}
              label={tSubmit("copyEmail")}
              copiedLabel={tSubmit("copied")}
              failedLabel={tSubmit("copyFailed")}
              className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-white/30 hover:text-white"
              statusClassName="ml-1"
            />
          </div>

          <div className="mt-7 border-t border-white/10 pt-5">
            <h3 className="text-sm font-semibold text-zinc-100">
              {t("featuredTitle")}
            </h3>
            {featured.length > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {featured.slice(0, 2).map((work) => (
                  <CommunityCard key={work.id} work={work} />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                {t("featuredEmpty")}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PastTheme({
  theme,
  locale,
  works,
  t,
  tAll,
}: {
  theme: CommunityTheme;
  locale: string;
  works: CommunityWork[];
  t: ThemeTranslator;
  tAll: AnyTranslator;
}) {
  const title = tAll(theme.titleKey);
  const description = tAll(theme.descriptionKey);
  const coverAlt = tAll(theme.coverAltKey);
  const dateRange = t("dateRange", {
    start: formatThemeDate(theme.startsAt, locale, theme.timezone),
    end: formatThemeDate(theme.endsAt, locale, theme.timezone),
  });

  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
      <div className="grid md:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)]">
        <ThemeCover theme={theme} alt={coverAlt} />
        <div className="p-5 md:p-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            {t("endedBadge")} · {dateRange}
          </p>
          <h3 className="mt-2 text-xl font-semibold">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {description}
          </p>
          <p className="mt-3 text-xs text-zinc-500">
            {t("pastWorksCount", { count: works.length })}
          </p>
        </div>
      </div>
      <div className="border-t border-white/10 p-5 md:p-6">
        <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
          {works.map((work) => (
            <div key={work.id} className="mb-3 break-inside-avoid">
              <CommunityCard work={work} />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
