"use client";

import { useTranslations } from "next-intl";
import type { DeviceCategory } from "@/lib/media";

/** Honest native-device + ratio/dimension badge. Never implies other variants. */
export default function WallpaperDeviceBadge({
  devices,
  ratio,
  width,
  height,
  showDimensions = false,
  className = "",
}: {
  devices: readonly DeviceCategory[];
  ratio: string;
  width?: number | null;
  height?: number | null;
  showDimensions?: boolean;
  className?: string;
}) {
  const t = useTranslations("devices");
  const labels = devices.map((device) => t(device)).join(" / ");
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[10px] font-medium text-zinc-300 backdrop-blur ${className}`}
    >
      <span className="text-violet-200">{labels || "—"}</span>
      <span aria-hidden className="text-zinc-600">·</span>
      <span>{ratio}</span>
      {showDimensions && width && height ? (
        <>
          <span aria-hidden className="text-zinc-600">·</span>
          <span className="tabular-nums">
            {width} × {height}
          </span>
        </>
      ) : null}
    </span>
  );
}
