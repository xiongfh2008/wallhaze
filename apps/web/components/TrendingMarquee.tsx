"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { STYLE_SPOTLIGHT } from "@/lib/wallpapers";
import { webpSrcSet } from "@/lib/images";
import WallpaperImage from "./WallpaperImage";

/**
 * Homepage "More styles, more inspiration" band — a seamless auto-carousel.
 *
 * Motion strategy: the rail stays a NATIVE horizontal scroller, so touch
 * swipe, wheel and card taps keep working with zero JS involvement, and a
 * requestAnimationFrame loop advances scrollLeft at a constant px/s rate.
 * The card sequence is rendered THREE times (8 cards ≈ one viewport width,
 * so two copies could run out of content on a 1920 px screen); the wrap
 * point is the exact distance between consecutive sequences, measured from
 * the DOM, and scrolling is rewound by that period — the content is
 * identical on both sides of the seam, so the loop is invisible.
 *
 * The scroll position lives in a float kept by the loop (browsers may floor
 * scrollLeft; flooring 0.6 px/frame would stall). User interaction syncs it
 * from the DOM. React never re-renders during playback, images never reload.
 *
 * Pause rules: hover (desktop), document hidden, and any user interaction
 * (pointer/touch/wheel/arrow keys) suspend the loop; release resumes after
 * a short grace period. With prefers-reduced-motion the loop never starts
 * and the band falls back to the original snap-scroll rail — still fully
 * browsable, motion-free.
 *
 * The scrollbar is hidden on every platform (scrollbar-width + webkit
 * pseudo); the viewport clips overflow, so nothing leaks to the page.
 */

/** Autoplay speed in px/s (within the suggested 30–45 band). */
const SPEED_PX_PER_SECOND = 38;
/** Grace period after a user interaction before autoplay resumes (ms). */
const RESUME_DELAY_MS = 1200;

export default function TrendingMarquee() {
  const t = useTranslations("trending");
  const tStyles = useTranslations("styleLabels");

  const viewportRef = useRef<HTMLDivElement | null>(null);
  // Hydration-safe: SSR always renders the animated layout; only a mounted
  // matchMedia check may flip to the reduced-motion fallback.
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Reading a media query is a browser fact available only after mount;
    // there is no render-time equivalent and no cascading update follows.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser fact after hydration
    setReducedMotion(media.matches);
    const onChange = (event: MediaQueryListEvent) =>
      setReducedMotion(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    let frame = 0;
    let lastTick: number | null = null;
    let hovering = false;
    let interacting = false;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    /** Authoritative rail position (float; DOM scrollLeft may be floored). */
    let position = viewport.scrollLeft;

    const suspended = () =>
      hovering || interacting || document.visibilityState !== "visible";

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      if (suspended()) {
        lastTick = null;
        return;
      }
      const groups = viewport.children;
      if (groups.length < 2) return;
      // Exact loop period: the distance between consecutive sequences.
      const period =
        (groups[1] as HTMLElement).offsetLeft -
        (groups[0] as HTMLElement).offsetLeft;
      if (period <= 0) return;
      if (lastTick === null) {
        lastTick = now;
        return;
      }
      const deltaSeconds = Math.min((now - lastTick) / 1000, 0.1);
      lastTick = now;
      position += SPEED_PX_PER_SECOND * deltaSeconds;
      // One sequence has scrolled past: rewind by exactly one period. The
      // duplicated sequences make the seam invisible.
      if (position >= period) position -= period;
      viewport.scrollLeft = position;
    };

    const syncFromDom = () => {
      position = viewport.scrollLeft;
    };
    const startInteraction = () => {
      interacting = true;
      if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
      }
      syncFromDom();
      lastTick = null;
    };
    const endInteraction = () => {
      syncFromDom();
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        interacting = false;
      }, RESUME_DELAY_MS);
    };
    const onVisibility = () => {
      lastTick = null;
    };
    const onMouseEnter = () => {
      hovering = true;
    };
    const onMouseLeave = () => {
      hovering = false;
    };

    viewport.addEventListener("mouseenter", onMouseEnter);
    viewport.addEventListener("mouseleave", onMouseLeave);
    viewport.addEventListener("pointerdown", startInteraction);
    viewport.addEventListener("wheel", startInteraction, { passive: true });
    viewport.addEventListener("keydown", startInteraction);
    window.addEventListener("pointerup", endInteraction);
    window.addEventListener("pointercancel", endInteraction);
    document.addEventListener("visibilitychange", onVisibility);

    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      if (resumeTimer) clearTimeout(resumeTimer);
      viewport.removeEventListener("mouseenter", onMouseEnter);
      viewport.removeEventListener("mouseleave", onMouseLeave);
      viewport.removeEventListener("pointerdown", startInteraction);
      viewport.removeEventListener("wheel", startInteraction);
      viewport.removeEventListener("keydown", startInteraction);
      window.removeEventListener("pointerup", endInteraction);
      window.removeEventListener("pointercancel", endInteraction);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reducedMotion]);

  const renderCard = (
    { style, wallpaper }: (typeof STYLE_SPOTLIGHT)[number],
    clone: boolean
  ) => {
    const label = tStyles(style.id);
    const href = wallpaper
      ? `/wallpapers/${wallpaper.id}`
      : `/studio?style=${style.id}`;
    return (
      <Link
        key={`${clone ? "clone-" : ""}${style.id}`}
        href={href}
        aria-label={t("cardAria", { label })}
        tabIndex={clone ? -1 : undefined}
        className="group relative block w-[46vw] max-w-[224px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 shadow-lg shadow-black/40 outline-none transition hover:border-violet-400/40 focus-visible:ring-2 focus-visible:ring-violet-400/60 sm:w-[38vw] md:w-[224px]"
      >
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: "3 / 4" }}
        >
          <WallpaperImage
            src={style.image}
            alt={clone ? "" : t("previewAlt", { label })}
            gradient={style.gradient}
            srcSet={style.image ? webpSrcSet(style.image) : undefined}
            // Card is 46vw on phones, 224px from md up.
            sizes="(max-width: 639px) 46vw, (max-width: 767px) 38vw, 224px"
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3.5">
            <h3 className="truncate text-sm font-semibold text-white">
              {label}
            </h3>
            <span
              aria-hidden
              className="shrink-0 text-xs font-medium text-violet-300 opacity-0 transition duration-300 group-hover:opacity-100"
            >
              &rarr;
            </span>
          </div>
        </div>
      </Link>
    );
  };

  /** One full card sequence; clones share every visual but a11y surfaces. */
  const sequence = (clone: boolean) => (
    <div
      aria-hidden={clone || undefined}
      className="flex gap-4 pr-4 md:gap-5 md:pr-5"
    >
      {STYLE_SPOTLIGHT.map((entry) => renderCard(entry, clone))}
    </div>
  );

  return (
    <section
      aria-label={t("aria")}
      className="relative border-y border-white/5 bg-white/[0.02] py-12 md:py-16"
    >
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
          {t("title")}
        </p>
      </div>

      {/* Full-bleed rail. Hidden scrollbar on every platform; the viewport
          clips everything so the page never overflows horizontally. The
          second and third sequences are decorative (aria-hidden, not
          focusable) and exist only so the loop can rewind invisibly. */}
      <div
        ref={viewportRef}
        className={`mt-6 flex overflow-x-auto pl-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mt-8 ${
          reducedMotion
            ? "snap-x snap-mandatory [scroll-padding-inline:1.5rem]"
            : ""
        }`}
      >
        {sequence(false)}
        {sequence(true)}
        {sequence(true)}
      </div>
    </section>
  );
}
