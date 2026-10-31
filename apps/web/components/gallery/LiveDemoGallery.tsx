"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import WallpaperDeviceBadge from "@/components/media/WallpaperDeviceBadge";
import { LIVE_DEMOS, type LiveDemo } from "@/lib/live-demos";
import {
  formatAspectRatio,
  type DeviceCategory,
} from "@/lib/media";

/**
 * "More live demos" (2026-10-31 redesign): six original AI-generated live
 * wallpapers in a uniform grid — 3 per row on desktop (2 rows), 2 on
 * tablet, 1 on mobile.
 *
 * Playback policy (per component contract):
 *  - autoplay muted+loop+playsInline with a poster, only while the card is
 *    meaningfully inside the viewport (IntersectionObserver, 40%);
 *  - leaving the viewport pauses; mobile (coarse pointer) plays at most
 *    ONE video at a time — starting one pauses the others;
 *  - autoplay rejection (browser policy) or load errors degrade to the
 *    poster with a tap-to-play retry;
 *  - prefers-reduced-motion disables autoplay entirely (poster only);
 *  - preload="none": nothing downloads until a video is actually played.
 * All videos are original self-authored AI generation — no model names are
 * shown to visitors.
 */

interface PlayingRegistry {
  pauseAllExcept: (video: HTMLVideoElement | null) => void;
}

/** Module-level registry so only one demo video ever plays at a time. */
const registry: PlayingRegistry = {
  pauseAllExcept(video) {
    document
      .querySelectorAll<HTMLVideoElement>("video[data-live-demo]")
      .forEach((el) => {
        if (el !== video && !el.paused) el.pause();
      });
  },
};

function DemoVideoCard({ demo, index }: { demo: LiveDemo; index: number }) {
  const t = useTranslations("gallery");
  const tStyles = useTranslations("styleLabels");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLLIElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const tryPlay = () => {
      if (reducedMotion || manuallyPaused) return;
      // Mobile: never more than one demo playing at once.
      if (window.matchMedia("(pointer: coarse)").matches) {
        registry.pauseAllExcept(video);
      }
      video.play().catch(() => {
        // Autoplay rejected by browser policy: stay on the poster.
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
            tryPlay();
          } else if (!entry.isIntersecting) {
            video.pause();
          }
        }
      },
      { threshold: [0, 0.4] }
    );
    observer.observe(container);

    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [manuallyPaused]);

  const ratio = formatAspectRatio(demo.width, demo.height);

  return (
    <li ref={containerRef}>
      <Link
        href={`/studio?media=video&demo=${demo.id}`}
        aria-label={t(`liveDemos.${demo.id}.title`)}
        className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-black shadow-lg shadow-black/40 outline-none transition hover:border-violet-400/40 focus-visible:ring-2 focus-visible:ring-violet-400/60"
      >
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: `${demo.width} / ${demo.height}` }}
        >
          {failed ? null : (
            <video
              ref={videoRef}
              data-live-demo={demo.id}
              src={demo.video}
              poster={demo.poster}
              muted
              loop
              playsInline
              preload="none"
              tabIndex={-1}
              onError={() => setFailed(true)}
              className="h-full w-full object-cover"
            />
          )}
          {/* Poster underlay: shown before load, on error, or under
              reduced-motion / paused states. */}
          <div
            aria-hidden={!failed}
            className={`absolute inset-0 bg-gradient-to-br from-violet-800/30 via-zinc-950 to-black ${
              failed ? "" : "-z-10"
            }`}
          />
          <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
            {t("liveDemoBadge")}
          </span>
          <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white/75 backdrop-blur">
            {Math.round(demo.durationSeconds)}s
          </span>
        </div>
        <span className="block px-4 py-3">
          <span className="block truncate text-sm font-semibold text-white">
            {t(`liveDemos.${demo.id}.title`)}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-zinc-500">
              {tStyles(demo.styleId)}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
              {ratio} · {index + 1}/6
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Six original live-wallpaper demos in a uniform grid: 3 per row on
 * desktop (2 rows), 2 per row on tablet, 1 per row on mobile. The device
 * filter is honoured; every current demo is desktop-format, so a
 * phone/tablet filter keeps showing the full set (they play everywhere).
 */
export default function LiveDemoGallery({
  deviceFilter,
}: {
  deviceFilter: "all" | DeviceCategory;
}) {
  const t = useTranslations("gallery");
  const filtered =
    deviceFilter === "all"
      ? LIVE_DEMOS
      : LIVE_DEMOS.filter((demo) => demo.devices.includes(deviceFilter));
  // All current demos are desktop-format; never leave a filter tab empty.
  const demos = filtered.length > 0 ? filtered : [...LIVE_DEMOS];
  const fellBack = filtered.length === 0;

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
        <Link
          href="/studio?media=video"
          className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-violet-300 transition hover:text-violet-200"
        >
          {t("liveDemoCta")}
          <span
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5"
          >
            &rarr;
          </span>
        </Link>
      </div>

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {demos.map((demo, index) => (
          <DemoVideoCard key={demo.id} demo={demo} index={index} />
        ))}
      </ul>

      {fellBack ? (
        <p className="mt-3 text-xs text-zinc-500">{t("liveDemoDesktopNote")}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">{t("liveDemoAiNote")}</p>
      </div>
    </section>
  );
}
