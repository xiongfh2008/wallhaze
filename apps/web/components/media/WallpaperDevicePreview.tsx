"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import WallpaperImage from "@/components/WallpaperImage";
import type { DeviceCategory } from "@/lib/media";

const FRAMES: Record<DeviceCategory, string> = {
  phone: "aspect-[9/16] w-full max-w-[220px] rounded-[1.6rem]",
  tablet: "aspect-[3/4] w-full max-w-[340px] rounded-[1.3rem]",
  desktop: "aspect-[16/9] w-full max-w-[560px] rounded-xl",
};

/**
 * CSS-only device effect preview. The image is cropped/padded visually for a
 * device frame; this is NOT a separate downloaded variant and the UI says so.
 */
export default function WallpaperDevicePreview({
  image,
  alt,
  gradient,
  nativeDevices,
}: {
  image: string;
  alt: string;
  gradient: string;
  nativeDevices: readonly DeviceCategory[];
}) {
  const tDevices = useTranslations("devices");
  const t = useTranslations("detail");
  const [device, setDevice] = useState<DeviceCategory>(
    nativeDevices[0] ?? "phone"
  );

  return (
    <section
      aria-labelledby="device-preview-heading"
      className="mt-12 rounded-3xl border border-white/10 bg-white/[0.02] p-5 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="device-preview-heading" className="text-lg font-semibold">
            {t("devicePreviewTitle")}
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-500">
            {t("devicePreviewBody")}
          </p>
        </div>
        <span className="rounded-full border border-amber-400/20 bg-amber-400/5 px-2.5 py-1 text-[10px] font-medium text-amber-200">
          {t("previewOnly")}
        </span>
      </div>

      <div
        role="group"
        aria-label={t("devicePreviewSelectAria")}
        className="mt-4 inline-flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-black/30 p-1"
      >
        {(["phone", "tablet", "desktop"] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={device === id}
            onClick={() => setDevice(id)}
            className={`min-h-10 rounded-xl px-4 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 ${
              device === id
                ? "bg-violet-500/20 text-white ring-1 ring-violet-400/40"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            {tDevices(id)}
            {nativeDevices.includes(id) ? (
              <span className="ml-1.5 text-[10px] text-violet-300">
                {t("nativeShort")}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-5 flex justify-center">
        <div
          className={`relative overflow-hidden border border-white/20 bg-black p-1.5 shadow-2xl shadow-black/60 ${FRAMES[device]}`}
        >
          <WallpaperImage
            src={image}
            alt={alt}
            gradient={gradient}
            className="h-full w-full rounded-[inherit] object-cover"
            eager
          />
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white/75 backdrop-blur">
            {t("simulatedFrame", { device: tDevices(device) })}
          </span>
        </div>
      </div>
    </section>
  );
}
