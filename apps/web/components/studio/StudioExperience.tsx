"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import GeneratorSection from "@/components/GeneratorSection";
import LiveWallpaperStudio from "@/components/studio/LiveWallpaperStudio";
import { STUDIO_MODE_EVENT } from "@/lib/studio/draft";

type StudioMode = "image" | "video";

/**
 * Studio mode switch. Both panels stay mounted (hidden when inactive) so
 * each mode keeps its form, source image and last result when the user flips
 * back — no state is silently discarded.
 */
export default function StudioExperience() {
  const t = useTranslations("liveStudio");
  const [mode, setMode] = useState<StudioMode>("image");

  // My Creations' "create again" links open the live mode with a hint; the
  // form itself is still the single source of truth for editable values.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("media");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL is external navigation state
    if (requested === "video") setMode("video");
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(STUDIO_MODE_EVENT, { detail: mode }));
  }, [mode]);

  return (
    <>
      <div className="mx-auto mb-6 w-full max-w-[1320px] px-6">
        <div
          role="group"
          aria-label={t("switchAria")}
          className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-black/30 p-1"
        >
          {(["image", "video"] as const).map((id) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setMode(id)}
                className={`min-h-11 rounded-xl px-4 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/70 ${
                  active
                    ? "bg-gradient-to-r from-violet-600/80 to-fuchsia-600/70 text-white shadow-lg shadow-violet-950/30"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                <span className="block text-sm font-semibold">
                  {id === "image" ? t("staticTab") : t("liveTab")}
                </span>
                <span
                  className={`mt-0.5 block text-[11px] ${
                    active ? "text-white/70" : "text-zinc-600"
                  }`}
                >
                  {id === "image" ? t("staticHint") : t("liveHint")}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div hidden={mode !== "image"}>
        <GeneratorSection variant="studio" />
      </div>
      <div hidden={mode !== "video"}>
        <LiveWallpaperStudio />
      </div>
    </>
  );
}
