"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
      {playing ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
    </svg>
  );
}

/**
 * Minimal silent looping video player used by demos, the Studio result and My
 * Creations. It loads lazily, never autoplays except after an explicit demo
 * selection (reduced-motion still wins), and exposes a text control in
 * addition to the native keyboard/focus behavior.
 */
export default function LiveVideoPlayer({
  src,
  poster,
  durationSeconds,
  className = "",
  label,
  fit = "contain",
  autoPlay = false,
  fallbackGradient = "from-violet-700/40 via-zinc-950 to-black",
}: {
  src: string;
  poster: string | null;
  durationSeconds: number | null;
  className?: string;
  label: string;
  fit?: "contain" | "cover";
  /** Start playback after an explicit user selection (reduced-motion wins). */
  autoPlay?: boolean;
  fallbackGradient?: string;
}) {
  const t = useTranslations("liveStudio");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!autoPlay || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch(() => {
      // Autoplay can be blocked; the visible play control remains.
    });
  }, [autoPlay, src]);

  const toggle = async () => {
    const video = videoRef.current;
    if (!video || failed) return;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        // A rejected play() is often an interrupted/aborted play, not a
        // broken file (e.g. the page hid while it was starting). Only a real
        // media error should replace the preview with the failure message.
        if (video.error) setFailed(true);
      }
    } else {
      video.pause();
    }
  };

  return (
    <div className={`group relative h-full w-full overflow-hidden bg-black ${className}`}>
      {!poster && !playing && !failed ? (
        <div
          aria-hidden
          className={`absolute inset-0 bg-gradient-to-br ${fallbackGradient}`}
        />
      ) : null}
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        muted
        loop
        playsInline
        preload="none"
        aria-label={label}
        className={`relative h-full w-full transition-opacity ${
          fit === "cover" ? "object-cover" : "object-contain"
        } ${poster || playing || failed ? "opacity-100" : "opacity-0"}`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-4 text-center text-sm text-amber-200">
          {t("videoUnavailable")}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={playing ? t("pause") : t("play")}
          className={`absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/60 text-white outline-none backdrop-blur transition hover:bg-black/80 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-violet-400/80 ${playing ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}
        >
          <PlayIcon playing={playing} />
        </button>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5">
        {durationSeconds ? (
          <span className="rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white/85 backdrop-blur">
            {t("durationBadge", { seconds: durationSeconds })}
          </span>
        ) : null}
        <span className="rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white/65 backdrop-blur">
          {t("mutedBadge")}
        </span>
      </div>
    </div>
  );
}
