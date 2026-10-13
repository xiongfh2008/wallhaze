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
  /** Base64 data URI — sent to /api/generate for image-to-image editing. */
  url: string;
}

interface GeneratedImage {
  url: string;
  width: number | null;
  height: number | null;
}

type GenerationStatus = "idle" | "generating" | "success" | "error";

const REF_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const REF_MAX_BYTES = 5 * 1024 * 1024;

function refFileError(file: File): string | null {
  if (!REF_ALLOWED_TYPES.includes(file.type)) {
    return "Unsupported format — please use PNG, JPEG or WebP.";
  }
  if (file.size === 0) {
    return "That file is empty — please choose a valid image.";
  }
  if (file.size > REF_MAX_BYTES) {
    return "Image is too large — please keep it under 5 MB.";
  }
  return null;
}

export default function GeneratorSection() {
  const [styleId, setStyleId] = useState<WallStyle["id"] | null>(null);
  const [device, setDevice] = useState<DeviceId>("phone");
  const [prompt, setPrompt] = useState("");
  const [refImage, setRefImage] = useState<RefImage | null>(null);
  const [refError, setRefError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [resultImage, setResultImage] = useState<GeneratedImage | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Style cards in the gallery dispatch this event to preselect a style here.
  useEffect(() => {
    const onStyleSelect = (event: Event) => {
      const style = findStyle((event as CustomEvent<string>).detail);
      if (style) setStyleId(style.id);
    };
    window.addEventListener(STYLE_SELECT_EVENT, onStyleSelect);
    return () => window.removeEventListener(STYLE_SELECT_EVENT, onStyleSelect);
  }, []);

  const selectedStyle = styleId ? findStyle(styleId) : undefined;
  const selectedDevice = DEVICES.find((item) => item.id === device);
  const previewSrc =
    resultImage?.url ?? selectedStyle?.image ?? DEMO_SAMPLE_IMAGE;
  const previewGradient =
    selectedStyle?.gradient ?? "from-violet-600 via-purple-950 to-black";

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    const problem = refFileError(file);
    if (problem) {
      setRefError(problem);
      setRefImage(null);
      return;
    }
    // Read as a data URI so it can be posted to /api/generate directly.
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setRefImage({ name: file.name, url: reader.result });
        setRefError(null);
      } else {
        setRefError("That image could not be read. Please try another file.");
      }
    };
    reader.onerror = () =>
      setRefError("That image could not be read. Please try another file.");
    reader.readAsDataURL(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  const handleGenerate = async () => {
    if (status === "generating") return;
    setStatus("generating");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // refImage is omitted entirely in text-only mode (undefined drops
        // from JSON), which switches the server back to text-to-image.
        body: JSON.stringify({
          prompt,
          styleId,
          device,
          refImage: refImage?.url,
        }),
      });
      const data = (await response.json()) as {
        imageUrl?: string;
        width?: number | null;
        height?: number | null;
        error?: string;
      };
      if (!response.ok || !data.imageUrl) {
        setErrorMessage(
          data.error ?? "Image generation failed. Please try again."
        );
        setStatus("error");
        return;
      }
      setResultImage({
        url: data.imageUrl,
        width: data.width ?? null,
        height: data.height ?? null,
      });
      setStatus("success");
    } catch {
      setErrorMessage(
        "Network error — could not start generation. Please try again."
      );
      setStatus("error");
    }
  };

  const handleDownload = async () => {
    if (!resultImage) return;
    try {
      const response = await fetch(resultImage.url);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `wallhaze-wallpaper-${Date.now()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoke on a delay — revoking synchronously can cancel the download in
      // Firefox/Safari before it reaches the download manager.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch {
      // Cross-origin download may be blocked — fall back to opening the image.
      window.open(resultImage.url, "_blank", "noopener");
    }
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
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  handleFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              {refError && (
                <p
                  role="alert"
                  className="mb-2 text-xs font-medium text-red-300"
                >
                  {refError}
                </p>
              )}
              {refImage ? (
                <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-black/40 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local data URI preview */}
                  <img
                    src={refImage.url}
                    alt="Reference image preview"
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-200">{refImage.name}</p>
                    <p className="text-xs text-zinc-500">
                      Will be used as the base for your generation
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRefImage(null);
                      setRefError(null);
                    }}
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
                    PNG, JPG or WebP — up to 5 MB
                  </span>
                  <span className="text-xs text-zinc-600">
                    Used as the base for your generation
                  </span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={status === "generating"}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-4 text-sm font-semibold shadow-xl shadow-violet-950/50 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:brightness-100"
            >
              {status === "generating" ? (
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 animate-spin">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              ) : (
                <SparklesIcon className="h-5 w-5" />
              )}
              {status === "generating" ? "Generating…" : "Generate Wallpaper"}
            </button>

            {status === "error" && errorMessage && (
              <div
                role="alert"
                className="animate-rise-in mt-4 flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
              >
                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{errorMessage}</p>
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
                  alt={
                    resultImage
                      ? "Your generated wallpaper"
                      : `Sample ${selectedStyle?.label ?? "default"} artwork preview`
                  }
                  gradient={previewGradient}
                  className="h-full w-full object-cover"
                />
                {device === "phone" && (
                  <div className="absolute left-1/2 top-2.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-black/70" />
                )}
              </div>
            </div>
            <p className="mt-5 max-w-[16rem] text-center text-xs leading-relaxed text-zinc-500">
              {status === "generating"
                ? "Generating your wallpaper — this usually takes a few seconds…"
                : resultImage
                  ? "Your generated wallpaper — fresh from the AI studio."
                  : "Demo preview — sample artwork for illustration, not a generated result."}
            </p>
            {resultImage && status !== "generating" && (
              <div className="mt-3 flex gap-2">
                <a
                  href={resultImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/35 hover:text-white"
                >
                  Open image
                </a>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="rounded-full border border-violet-400/40 bg-violet-500/15 px-4 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/25"
                >
                  Download
                </button>
              </div>
            )}
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
