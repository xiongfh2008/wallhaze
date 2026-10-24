"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import WallpaperImage from "@/components/WallpaperImage";
import WallpaperDeviceBadge from "@/components/media/WallpaperDeviceBadge";
import LiveVideoPlayer from "@/components/studio/LiveVideoPlayer";
import { LIVE_DEMOS, type LiveDemo } from "@/lib/live-demos";
import {
  formatAspectRatio,
  sortMediaForPreferredDevice,
  type DeviceCategory,
} from "@/lib/media";
import { detectDeviceProfile, readScreenInfo } from "@/lib/studio/device";
import { findStyle } from "@/lib/styles";

/**
 * Motion-demo gallery. One shared video player prevents multiple decoders
 * from running at once; the remaining demos are poster cards. The desktop
 * layout is one hero preview + a 2×2 showcase + a compact remaining grid;
 * mobile is one hero preview + a horizontal recommendation strip.
 */
export default function LiveDemoGallery({
  deviceFilter,
}: {
  deviceFilter: "all" | DeviceCategory;
}) {
  const t = useTranslations("gallery");
  const tStyles = useTranslations("styleLabels");
  const [preferredDevice, setPreferredDevice] = useState<DeviceCategory | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [userSelected, setUserSelected] = useState(false);

  useEffect(() => {
    const info = readScreenInfo();
    const profile = info ? detectDeviceProfile(info) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser facts after hydration
    setPreferredDevice(profile?.device ?? null);
  }, []);

  const demos = useMemo(() => {
    return deviceFilter === "all"
      ? sortMediaForPreferredDevice(LIVE_DEMOS, preferredDevice)
      : LIVE_DEMOS.filter((demo) => demo.devices.includes(deviceFilter));
  }, [deviceFilter, preferredDevice]);

  const selected: LiveDemo | null =
    (userSelected ? demos.find((demo) => demo.id === selectedId) : undefined) ??
    demos[0] ??
    null;
  const grid = selected
    ? demos.filter((demo) => demo.id !== selected.id).slice(0, 4)
    : demos.slice(0, 4);
  const gridIds = new Set(grid.map((demo) => demo.id));
  const remaining = demos.filter(
    (demo) => demo.id !== selected?.id && !gridIds.has(demo.id)
  );
  const ratio = selected
    ? formatAspectRatio(selected.width, selected.height)
    : "—";
  const portrait = selected ? selected.height > selected.width : false;
  const square = selected ? selected.width === selected.height : false;
  const styleLabel = selected ? tStyles(selected.styleId) : "";

  const selectDemo = (demo: LiveDemo, autoPlay = true) => {
    setSelectedId(demo.id);
    setUserSelected(autoPlay);
  };

  const demoThumb = (demo: LiveDemo, active: boolean, compact = false) => {
    const style = findStyle(demo.styleId);
    const demoRatio = formatAspectRatio(demo.width, demo.height);
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => selectDemo(demo)}
        className={`group w-full overflow-hidden rounded-xl border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 ${
          active
            ? "border-violet-400/70 bg-violet-500/10 ring-1 ring-violet-400/40"
            : "border-white/10 bg-white/[0.02] hover:border-white/30"
        }`}
      >
        <span className={`relative block bg-black/40 ${compact ? "aspect-[16/10]" : "aspect-[16/9]"}`}>
          <WallpaperImage
            src={demo.poster}
            alt={t(`liveDemos.${demo.id}.alt`)}
            gradient={style?.gradient ?? "from-violet-700 to-black"}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            eager={active}
          />
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur">
            {t("liveDemoBadge")}
          </span>
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white/70 backdrop-blur">
            {demo.durationSeconds}s
          </span>
        </span>
        <span className="block px-3 py-2">
          <span className="block truncate text-xs font-medium text-white">
            {t(`liveDemos.${demo.id}.title`)}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] text-zinc-500">
              {tStyles(demo.styleId)}
            </span>
            <span className="shrink-0 text-[10px] text-zinc-500">{demoRatio}</span>
          </span>
        </span>
      </button>
    );
  };

  return (
    <section aria-labelledby="live-demo-heading" className="mb-12">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <p className="inline-flex rounded-full border border-amber-400/25 bg-amber-400/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-200">
            {t("liveDemoBadge")}
          </p>
          <h2
            id="live-demo-heading"
            className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl"
          >
            {t("liveDemoTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {t("liveDemoBody")}
          </p>
        </div>
      </div>

      {!selected ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-zinc-400">
          {t("liveDemoEmpty")}
        </p>
      ) : (
        <>
          <div
            className={`grid gap-4 ${
              grid.length > 0
                ? "lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start"
                : ""
            }`}
          >
            <div className="flex min-w-0 flex-col items-center rounded-3xl border border-white/10 bg-white/[0.02] p-4 md:p-6">
              <div
                className={`relative w-full overflow-hidden rounded-2xl border border-white/15 bg-black ${
                  portrait ? "max-w-[320px]" : square ? "max-w-[440px]" : ""
                }`}
                style={{ aspectRatio: `${selected.width} / ${selected.height}` }}
              >
                <LiveVideoPlayer
                  key={selected.id}
                  src={selected.video}
                  poster={selected.poster}
                  durationSeconds={selected.durationSeconds}
                  label={t(`liveDemos.${selected.id}.alt`)}
                  autoPlay={userSelected}
                  fallbackGradient="from-violet-800/40 via-zinc-950 to-black"
                />
              </div>
              <div className="mt-4 flex w-full max-w-[720px] flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white">
                    {t(`liveDemos.${selected.id}.title`)}
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-500">{styleLabel}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                    {t("liveDemoSourceNote", {
                      license: selected.source.license.toUpperCase(),
                    })}
                  </p>
                </div>
                <WallpaperDeviceBadge
                  devices={selected.devices}
                  ratio={ratio}
                  width={selected.width}
                  height={selected.height}
                  showDimensions
                />
              </div>
              <p className="mt-3 max-w-[720px] text-xs leading-relaxed text-zinc-500">
                {t("liveDemoNote")}
              </p>
            </div>

            {grid.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  {t("liveDemoFeatured")}
                </p>
                <ul className="grid grid-cols-2 gap-2.5">
                  {grid.map((demo) => (
                    <li key={demo.id}>
                      {demoThumb(demo, selected.id === demo.id, true)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {remaining.length > 0 ? (
            <div className="mt-5 hidden lg:block">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("liveDemoMore")}
              </p>
              <ul className="grid grid-cols-3 gap-2.5 xl:grid-cols-4">
                {remaining.map((demo) => (
                  <li key={demo.id}>
                    {demoThumb(demo, selected.id === demo.id)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-5 lg:hidden">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {t("liveDemoAll")}
            </p>
            <ul className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {demos.map((demo) => (
                <li key={demo.id} className="w-[58%] max-w-[230px] shrink-0 snap-start">
                  {demoThumb(demo, selected.id === demo.id, true)}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">{t("liveDemoNotAi")}</p>
        <Link
          href="/studio?media=video"
          className="inline-flex text-xs font-medium text-violet-300 underline-offset-4 hover:underline"
        >
          {t("liveCta")}
        </Link>
      </div>
    </section>
  );
}
