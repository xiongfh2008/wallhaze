"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEMO_SAMPLE_IMAGE,
  STYLE_SELECT_EVENT,
  WALLPAPER_STYLES,
  findStyle,
  type WallStyle,
} from "@/lib/styles";
import WallpaperImage from "./WallpaperImage";

/* ---- Icons ---- */

function PhoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={className}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  );
}

function TabletIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={className}>
      <rect x="4.5" y="3" width="15" height="18" rx="2.5" />
      <path d="M11 17.5h2" />
    </svg>
  );
}

function DesktopIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={className}>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M12 17v4M9 21h6" />
    </svg>
  );
}

function UploadIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 15.5V4m0 0L8 8m4-4 4 4" />
      <path d="M4 16.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2.5" />
    </svg>
  );
}

function SparklesIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path
        fill="currentColor"
        d="M12 2.5l2.1 6.2 6.4 2.1-6.4 2.1L12 19.1l-2.1-6.2-6.4-2.1 6.4-2.1L12 2.5z"
      />
      <path
        fill="currentColor"
        d="M19 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z"
      />
    </svg>
  );
}

function InfoIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v.01M12 11.5V16" />
    </svg>
  );
}

/* ---- Data ---- */

const DEVICES = [
  { id: "phone", label: "Phone", Icon: PhoneIcon },
  { id: "tablet", label: "Tablet", Icon: TabletIcon },
  { id: "desktop", label: "Desktop", Icon: DesktopIcon },
] as const;

type DeviceId = (typeof DEVICES)[number]["id"];

const PREVIEW_FRAME: Record<DeviceId, string> = {
  phone: "w-44 aspect-[9/19] md:w-52",
  tablet: "w-60 aspect-[3/4] md:w-72",
  desktop: "aspect-[16/10] w-full max-w-sm",
};

interface RefImage {
  name: string;
  url: string;
}

export default function GeneratorSection() {
  const [styleId, setStyleId] = useState<WallStyle["id"] | null>(null);
  const [device, setDevice] = useState<DeviceId>("phone");
  const [prompt, setPrompt] = useState("");
  const [refImage, setRefImage] = useState<RefImage | null>(null);
  const [dragging, setDragging] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refImageUrl = refImage?.url;

  // Revoke the object URL whenever it is replaced or the component unmounts.
  useEffect(() => {
    if (!refImageUrl) return;
    const url = refImageUrl;
    return () => URL.revokeObjectURL(url);
  }, [refImageUrl]);

  // Style cards in the gallery dispatch this event to preselect a style here.
  useEffect(() => {
    const onStyleSelect = (event: Event) => {
      const style = findStyle((event as CustomEvent<string>).detail);
      if (style) setStyleId(style.id);
    };
    window.addEventListener(STYLE_SELECT_EVENT, onStyleSelect);
    return () => window.removeEventListener(STYLE_SELECT_EVENT, onStyleSelect);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  const selectedStyle = styleId ? findStyle(styleId) : undefined;
  const selectedDevice = DEVICES.find((item) => item.id === device);
  const previewSrc = selectedStyle?.image ?? DEMO_SAMPLE_IMAGE;
  const previewGradient =
    selectedStyle?.gradient ?? "from-violet-600 via-purple-950 to-black";

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    setRefImage({ name: file.name, url: URL.createObjectURL(file) });
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  const handleGenerate = () => {
    setNoticeVisible(true);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNoticeVisible(false), 6000);
  };

  return (
    <section id="generator" className="relative py-24 md:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-pulse-glow absolute left-1/2 top-0 h-[420px] w-[680px] max-w-full -translate-x-1/2 rounded-full bg-violet-700/20 blur-[140px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="mb-12 max-w-2xl md:mb-14">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
            AI Generator
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
            Design your wallpaper in seconds
          </h2>
          <p className="mt-4 leading-relaxed text-zinc-400">
            Pick a style, choose your device — prompts and reference images are
            optional.
          </p>
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
          {/* Generator panel */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/50 backdrop-blur md:p-8">
            <fieldset>
              <legend className="mb-3 text-sm font-medium text-zinc-300">
                Style
              </legend>
              <div className="flex flex-wrap gap-2">
                {WALLPAPER_STYLES.map((style) => {
                  const active = styleId === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStyleId(active ? null : style.id)}
                      className={`rounded-full border px-4 py-2 text-sm transition ${
                        active
                          ? "border-violet-400/70 bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.35)]"
                          : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                      }`}
                    >
                      {style.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="mt-8">
              <legend className="mb-3 text-sm font-medium text-zinc-300">
                Device
              </legend>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
                {DEVICES.map(({ id, label, Icon }) => {
                  const active = device === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setDevice(id)}
                      className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm transition ${
                        active
                          ? "bg-violet-500/25 text-white ring-1 ring-violet-400/50"
                          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-8">
              <label
                htmlFor="wallpaper-prompt"
                className="mb-3 block text-sm font-medium text-zinc-300"
              >
                Prompt <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <textarea
                id="wallpaper-prompt"
                rows={3}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe your wallpaper — a neon skyline, a dreamy meadow, anything you imagine…"
                className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            <div className="mt-6">
              <span className="mb-3 block text-sm font-medium text-zinc-300">
                Reference image{" "}
                <span className="font-normal text-zinc-500">(optional)</span>
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  handleFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              {refImage ? (
                <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-black/40 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                  <img
                    src={refImage.url}
                    alt="Reference image preview"
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-200">{refImage.name}</p>
                    <p className="text-xs text-zinc-500">Ready as reference</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRefImage(null)}
                    className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/25 hover:text-zinc-100"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  className={`flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition ${
                    dragging
                      ? "border-violet-400/70 bg-violet-500/10"
                      : "border-white/15 bg-black/30 hover:border-white/30 hover:bg-white/[0.04]"
                  }`}
                >
                  <UploadIcon className="h-6 w-6 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-200">
                    Upload a reference image
                  </span>
                  <span className="text-xs text-zinc-500">
                    PNG or JPG — drag &amp; drop or click to browse
                  </span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-4 text-sm font-semibold shadow-xl shadow-violet-950/50 transition hover:brightness-110 active:scale-[0.99]"
            >
              <SparklesIcon className="h-5 w-5" />
              Generate Wallpaper
            </button>

            {noticeVisible && (
              <div
                role="status"
                className="animate-rise-in mt-4 flex items-start gap-3 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100"
              >
                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <span className="font-semibold">
                    AI generation will be available soon.
                  </span>{" "}
                  WallHaze is in early preview — your settings are saved for launch.
                </p>
              </div>
            )}
          </div>

          {/* Device preview */}
          <div className="flex flex-col items-center lg:sticky lg:top-28">
            <div
              className={`relative rounded-[1.75rem] border border-white/15 bg-black p-1.5 shadow-2xl shadow-violet-950/40 transition-all duration-300 ${PREVIEW_FRAME[device]}`}
            >
              <div className="relative h-full w-full overflow-hidden rounded-[1.45rem]">
                <WallpaperImage
                  src={previewSrc}
                  alt={`Sample ${selectedStyle?.label ?? "default"} artwork preview`}
                  gradient={previewGradient}
                  className="h-full w-full object-cover"
                />
                {device === "phone" && (
                  <div className="absolute left-1/2 top-2.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-black/70" />
                )}
              </div>
            </div>
            <p className="mt-5 max-w-[16rem] text-center text-xs leading-relaxed text-zinc-500">
              Demo preview — sample artwork for illustration, not a generated
              result.
            </p>
            {selectedStyle && selectedDevice && (
              <p className="mt-1 text-center text-xs font-medium text-violet-300">
                {selectedStyle.label} · {selectedDevice.label}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
