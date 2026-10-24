"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import WallpaperBrowser from "@/components/WallpaperBrowser";
import LiveDemoGallery from "@/components/gallery/LiveDemoGallery";
import {
  DEVICE_ORDER,
  type DeviceCategory,
} from "@/lib/media";
import { detectDeviceProfile, readScreenInfo } from "@/lib/studio/device";

type GalleryMode = "all" | "static" | "live";

/**
 * Gallery shell. Media type and device are one compact top toolbar shared by
 * the motion-demo section and the static grid — no duplicated device controls
 * inside each section. User-generated videos are never published here.
 */
export default function GalleryExperience() {
  const t = useTranslations("gallery");
  const tDevices = useTranslations("devices");
  const [mode, setMode] = useState<GalleryMode>("all");
  const [deviceFilter, setDeviceFilter] = useState<"all" | DeviceCategory>("all");
  const [preferredDevice, setPreferredDevice] = useState<DeviceCategory | null>(null);

  useEffect(() => {
    const info = readScreenInfo();
    const profile = info ? detectDeviceProfile(info) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser facts after hydration
    setPreferredDevice(profile?.device ?? null);
  }, []);

  const showLive = mode === "all" || mode === "live";
  const showStatic = mode === "all" || mode === "static";

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 md:flex-row md:flex-nowrap md:items-center md:justify-between">
        <div
          role="group"
          aria-label={t("mediaTabsAria")}
          className="inline-flex shrink-0 flex-nowrap items-center gap-1"
        >
          {(["all", "static", "live"] as const).map((id) => {
            const active = mode === id;
            const label =
              id === "all"
                ? t("allMedia")
                : id === "static"
                  ? t("staticTab")
                  : t("liveTab");
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setMode(id)}
                className={`min-h-10 rounded-xl px-3.5 py-1.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/70 ${
                  active
                    ? "bg-gradient-to-r from-violet-600/80 to-fuchsia-600/70 text-white shadow-lg shadow-violet-950/30"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {t("deviceFilterLabel")}
          </span>
          <div
            role="group"
            aria-label={t("deviceFilterAria")}
            className="flex flex-wrap gap-1"
          >
            <button
              type="button"
              aria-pressed={deviceFilter === "all"}
              onClick={() => setDeviceFilter("all")}
              className={`min-h-9 rounded-full border px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                deviceFilter === "all"
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
                aria-pressed={deviceFilter === id}
                onClick={() => setDeviceFilter(id)}
                className={`min-h-9 rounded-full border px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                  deviceFilter === id
                    ? "border-violet-400/70 bg-violet-500/20 text-white"
                    : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                }`}
              >
                {tDevices(id)}
              </button>
            ))}
          </div>
          {preferredDevice ? (
            <span className="hidden text-[11px] text-zinc-500 xl:inline">
              {t("deviceAutoHint", { device: tDevices(preferredDevice) })}
            </span>
          ) : null}
        </div>
      </div>

      {showLive ? (
        <LiveDemoGallery key={deviceFilter} deviceFilter={deviceFilter} />
      ) : null}
      {showStatic ? (
        <WallpaperBrowser
          deviceFilter={deviceFilter}
          onDeviceReset={() => setDeviceFilter("all")}
        />
      ) : null}
    </div>
  );
}
