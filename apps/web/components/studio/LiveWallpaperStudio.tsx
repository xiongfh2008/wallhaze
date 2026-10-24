"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type {
  AspectRatioId,
  VideoDurationSeconds,
  VideoGenerationRequest,
} from "@wallhaze/contracts";
import {
  ASPECT_RATIOS,
  DEVICE_PRESET_RATIO,
  type HistoryDevice,
} from "@/lib/sizes";
import { findStyle, type WallStyle } from "@/lib/styles";
import { authAdapter } from "@/lib/api/auth";
import { creditsAdapter, type CreditsPricing } from "@/lib/api/credits";
import { creationsAdapter, type CloudCreation } from "@/lib/api/creations";
import { resolveApiUrl } from "@/lib/api/client";
import {
  classifyReferenceFile,
  mimeMatchesHeader,
  readFileHeader,
} from "@/lib/studio/reference";
import { buildVideoGenerationRequest } from "@/lib/studio/video-request";
import {
  createVideoJobExecutor,
  type VideoGenerateOutcome,
} from "@/lib/studio/video-executor";
import { generationErrorKey } from "@/lib/studio/generation-error";
import { readStudioDraft, STUDIO_MODE_EVENT } from "@/lib/studio/draft";
import { STUDIO_DEFAULT_STYLE_ID } from "@/lib/studio/defaults";
import StylePicker from "@/components/StylePicker";
import WallpaperImage from "@/components/WallpaperImage";
import CreditsNotice, {
  type CreditsNoticeState,
} from "@/components/studio/CreditsNotice";
import GenerationConfirmDialog, {
  type ConfirmationSummary,
} from "@/components/studio/GenerationConfirmDialog";
import LiveVideoPlayer from "@/components/studio/LiveVideoPlayer";
import { LIVE_DEMOS } from "@/lib/live-demos";
import { formatAspectRatio, recommendVideoRatio } from "@/lib/media";
import { detectDeviceProfile, readScreenInfo } from "@/lib/studio/device";

const DEVICES: readonly HistoryDevice[] = ["phone", "tablet", "desktop"];
const DEVICE_WIDTH: Record<HistoryDevice, string> = {
  phone: "w-full max-w-[280px]",
  tablet: "w-full max-w-[440px]",
  desktop: "w-full max-w-[720px]",
};
const RATIO_ASPECT: Record<AspectRatioId, string> = {
  "9:16": "aspect-[9/16]",
  "3:4": "aspect-[3/4]",
  "1:1": "aspect-square",
  "4:3": "aspect-[4/3]",
  "16:9": "aspect-[16/9]",
};
const PROMPT_LIMIT = 800;
const MOTION_LIMIT = 500;

type SourceMode = "text" | "image";
type Status = "idle" | "generating" | "success" | "error";
type SourceCreation = CloudCreation & { imageUrl: string };

function defaultRatioFor(
  device: HistoryDevice,
  supported: readonly AspectRatioId[],
): AspectRatioId {
  const tabletPortrait =
    typeof window !== "undefined" && window.innerHeight > window.innerWidth;
  const preferred =
    device === "desktop"
      ? "16:9"
      : device === "tablet"
        ? tabletPortrait
          ? "9:16"
          : "16:9"
        : DEVICE_PRESET_RATIO.phone;
  return supported.includes(preferred) ? preferred : (supported[0] ?? "9:16");
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("read failed"));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Live wallpaper mode. It is a sibling panel of the static generator on the
 * same Studio page (not a separate product): same account, Credits, styles,
 * device model and async job API. Video jobs use the provider capability
 * matrix returned by the backend and never call a provider synchronously.
 */
export default function LiveWallpaperStudio() {
  const t = useTranslations("liveStudio");
  const tGen = useTranslations("generator");
  const tDevices = useTranslations("devices");
  const tStyles = useTranslations("styleLabels");
  const tGallery = useTranslations("gallery");

  const [styleId, setStyleId] = useState<WallStyle["id"] | null>(
    STUDIO_DEFAULT_STYLE_ID
  );
  const [sourceMode, setSourceMode] = useState<SourceMode>("text");
  const [prompt, setPrompt] = useState("");
  const [motionPrompt, setMotionPrompt] = useState("");
  const [device, setDevice] = useState<HistoryDevice>("phone");
  const [ratio, setRatio] = useState<AspectRatioId>("9:16");
  const [deviceMode, setDeviceMode] = useState<"auto" | "manual">("auto");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [demoId, setDemoId] = useState(LIVE_DEMOS[0]?.id ?? "");
  const [demoTouched, setDemoTouched] = useState(false);
  const [duration, setDuration] = useState<VideoDurationSeconds>(5);
  const [refImage, setRefImage] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const [sourceCreationId, setSourceCreationId] = useState<string | null>(null);
  const [sourceCreations, setSourceCreations] = useState<SourceCreation[]>([]);
  const [sourceState, setSourceState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [sourceEpoch, setSourceEpoch] = useState(0);
  const [refError, setRefError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<CreditsPricing | null>(null);
  const [accountState, setAccountState] = useState<
    "loading" | "unavailable" | "signed-out" | "ready"
  >("loading");
  const [walletCredits, setWalletCredits] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<Extract<
    VideoGenerateOutcome,
    { ok: true }
  > | null>(null);
  const [resultMeta, setResultMeta] = useState<{
    durationSeconds: number | null;
    ratio: AspectRatioId;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [longWait, setLongWait] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<ConfirmationSummary | null>(null);
  const [pendingRequest, setPendingRequest] =
    useState<VideoGenerationRequest | null>(null);
  const [pendingPrice, setPendingPrice] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedStyle = styleId ? findStyle(styleId) : undefined;
  const selectedSource = sourceCreations.find(
    (item) => item.id === sourceCreationId,
  );
  const requestMode =
    sourceMode === "image" ? "image_to_video" : "text_to_video";
  const videoPricing = pricing?.video;
  const modePricing = videoPricing?.modes[requestMode];
  const supportedRatios = modePricing?.aspectRatios ?? [];
  const supportedDurations = modePricing?.durations ?? [];
  const effectiveRatio = supportedRatios.includes(ratio)
    ? ratio
    : (supportedRatios[0] ?? "9:16");
  const effectiveDuration = supportedDurations.includes(duration)
    ? duration
    : (supportedDurations[supportedDurations.length - 1] ?? 5);
  const supportedRatioKey = supportedRatios.join(",");
  // Until the visitor picks a demo, follow the current device so the preview
  // never opens on a desktop clip for a phone (or vice versa).
  const selectedDemo =
    (demoTouched ? LIVE_DEMOS.find((demo) => demo.id === demoId) : undefined) ??
    LIVE_DEMOS.find((demo) => demo.devices.includes(device)) ??
    LIVE_DEMOS[0] ??
    null;
  const price = modePricing?.creditsByDuration[effectiveDuration] ?? null;
  const busy = status === "generating" || submitting;
  const hasSource = Boolean(sourceCreationId || refImage);
  const promptValid =
    sourceMode === "text"
      ? prompt.trim().length > 0 || styleId !== null
      : hasSource && (motionPrompt.trim().length > 0 || styleId !== null);
  const lengthsValid =
    prompt.length <= PROMPT_LIMIT && motionPrompt.length <= MOTION_LIMIT;
  const formValid = promptValid && lengthsValid;
  const canAfford =
    walletCredits !== null && price !== null && walletCredits >= price;
  const canSubmit = Boolean(
    videoPricing?.available &&
    modePricing &&
    price !== null &&
    accountState === "ready" &&
    canAfford &&
    formValid &&
    !busy,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [session, pricingResult] = await Promise.all([
        authAdapter.getSession(),
        creditsAdapter.getPricing(),
      ]);
      if (cancelled) return;
      if (pricingResult.ok) setPricing(pricingResult.data);
      if (!session.ok) {
        setAccountState("unavailable");
        return;
      }
      if (session.data === null) {
        setAccountState("signed-out");
        return;
      }
      const wallet = await creditsAdapter.getWallet();
      if (cancelled) return;
      setWalletCredits(
        wallet.ok
          ? Math.max(0, wallet.data.credits - (wallet.data.reserved ?? 0))
          : null,
      );
      setAccountState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Preserve a style deep link from gallery/style cards when entering live mode.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("style");
    const style = requested ? findStyle(requested) : undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deep-link handoff after hydration
    if (style) setStyleId(style.id);
    const requestedPrompt = params.get("prompt");
    if (requestedPrompt) setPrompt(requestedPrompt.slice(0, PROMPT_LIMIT));
  }, []);

  // Automatic device fit. The recommendation is limited to ratios the current
  // provider actually exposes, and it stops applying as soon as the visitor
  // chooses a device or ratio manually. It runs only when the capability
  // matrix changes (initial pricing, text/image switch), never on resize.
  /* eslint-disable react-hooks/set-state-in-effect -- one-shot browser fact after hydration */
  useEffect(() => {
    if (deviceMode !== "auto" || !supportedRatioKey) return;
    const info = readScreenInfo();
    const profile = info ? detectDeviceProfile(info) : null;
    if (!profile) return;
    const recommendation = recommendVideoRatio(
      profile,
      supportedRatioKey.split(",") as AspectRatioId[],
    );
    setDevice(recommendation.device);
    setRatio(recommendation.ratio);
  }, [deviceMode, supportedRatioKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (accountState !== "ready") return;
    let cancelled = false;
    void (async () => {
      setSourceState("loading");
      const page = await creationsAdapter.listCreations(undefined, "image");
      if (cancelled) return;
      if (!page.ok) {
        setSourceState("error");
        return;
      }
      setSourceCreations(
        page.data.items
          .filter(
            (item): item is SourceCreation =>
              item.status === "succeeded" &&
              item.mediaType === "image" &&
              typeof item.imageUrl === "string" &&
              item.imageUrl.length > 0,
          )
          .map((item) => ({
            ...item,
            imageUrl: resolveApiUrl(item.imageUrl) ?? item.imageUrl,
          }))
          .slice(0, 8),
      );
      setSourceState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [accountState, sourceEpoch]);

  useEffect(() => {
    const onMode = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== "video") return;
      const draft = readStudioDraft();
      if (!draft) return;
      if (draft.styleId && findStyle(draft.styleId)) {
        setStyleId(draft.styleId as WallStyle["id"]);
      }
      setPrompt(draft.prompt.slice(0, PROMPT_LIMIT));
      setDevice(draft.device);
      setRatio(draft.ratio);
      // The static form's device choice is an explicit user decision.
      setDeviceMode("manual");
      setSourceEpoch((value) => value + 1);
    };
    window.addEventListener(STUDIO_MODE_EVENT, onMode);
    return () => window.removeEventListener(STUDIO_MODE_EVENT, onMode);
  }, []);

  useEffect(() => {
    if (status !== "generating") return;
    const timer = window.setTimeout(() => setLongWait(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const noticeState: CreditsNoticeState =
    status === "generating"
      ? "in-flight"
      : accountState === "loading"
        ? "loading"
        : accountState === "unavailable"
          ? "unavailable"
          : accountState === "signed-out"
            ? "signed-out"
            : !videoPricing?.available || !modePricing || price === null
              ? "unavailable"
              : walletCredits === null
                ? "unavailable"
                : walletCredits < price
                  ? "insufficient"
                  : "ready";

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setRefError(null);
    const problem = classifyReferenceFile(file);
    if (problem === "format") {
      setRefError(tGen("refUnsupportedFormat"));
      return;
    }
    if (problem === "empty") {
      setRefError(tGen("refEmptyFile"));
      return;
    }
    if (problem === "too-large") {
      setRefError(tGen("refTooLarge"));
      return;
    }
    const header = await readFileHeader(file);
    if (!mimeMatchesHeader(file.type, header)) {
      setRefError(tGen("refReadFailed"));
      return;
    }
    try {
      const url = await readAsDataUrl(file);
      setRefImage({ name: file.name, url });
      setSourceCreationId(null);
    } catch {
      setRefError(tGen("refReadFailed"));
    }
  };

  const handleGenerate = () => {
    if (busy) return;
    setErrorMessage(null);
    if (!promptValid) {
      setErrorMessage(
        sourceMode === "image"
          ? hasSource
            ? t("motionRequired")
            : t("sourceRequired")
          : t("sceneRequired"),
      );
      setStatus("error");
      return;
    }
    if (!lengthsValid) {
      setErrorMessage(
        prompt.length > PROMPT_LIMIT ? t("sceneTooLong") : t("motionTooLong"),
      );
      setStatus("error");
      return;
    }
    if (!videoPricing?.available || !modePricing) {
      setErrorMessage(t("notConfigured"));
      setStatus("error");
      return;
    }
    if (price === null) {
      setErrorMessage(t("notConfigured"));
      setStatus("error");
      return;
    }
    if (accountState !== "ready") {
      setErrorMessage(tGen("errorUnauthenticated"));
      setStatus("error");
      return;
    }
    if (!canAfford) {
      setErrorMessage(tGen("errorInsufficientCredits"));
      setStatus("error");
      return;
    }
    const request = buildVideoGenerationRequest({
      prompt,
      motionPrompt,
      styleId,
      device,
      ratio: effectiveRatio,
      durationSeconds: effectiveDuration,
      sourceCreationId,
      refImageUrl: refImage?.url ?? null,
    });
    setPendingRequest(request);
    setPendingPrice(price);
    setSummary({
      prompt: prompt.trim() || motionPrompt.trim(),
      styleLabel: selectedStyle ? tStyles(selectedStyle.id) : null,
      deviceLabel: tDevices(device),
      selection: { device, ratio: effectiveRatio, presetId: null },
      presetLabel: null,
      mediaType: "video",
      durationSeconds: effectiveDuration,
      motionPrompt,
      sourceLabel:
        sourceMode === "image"
          ? (refImage?.name ?? selectedSource?.prompt ?? t("sourceImage"))
          : null,
    });
    setConfirmOpen(true);
  };

  // Restore the recommended device/ratio and the default supported duration.
  // The scene, style, motion and source image are creative choices and stay.
  const resetLiveRecommendation = () => {
    if (busy) return;
    setDeviceMode("auto");
    const info = readScreenInfo();
    const profile = info ? detectDeviceProfile(info) : null;
    if (profile && supportedRatios.length > 0) {
      const recommendation = recommendVideoRatio(profile, supportedRatios);
      setDevice(recommendation.device);
      setRatio(recommendation.ratio);
    } else {
      setDevice("phone");
      setRatio(defaultRatioFor("phone", supportedRatios));
    }
    setDuration(
      supportedDurations.includes(5)
        ? 5
        : (supportedDurations[supportedDurations.length - 1] ?? 5),
    );
  };

  const submitVideo = async () => {
    if (!pendingRequest || pendingPrice === null || submitting) return;
    if (!canSubmit) {
      setConfirmOpen(false);
      setErrorMessage(
        accountState !== "ready"
          ? tGen("errorUnauthenticated")
          : !canAfford
            ? tGen("errorInsufficientCredits")
            : t("notConfigured"),
      );
      setStatus("error");
      return;
    }
    setSubmitting(true);
    setConfirmOpen(false);
    setErrorMessage(null);
    setStatus("generating");
    setResult(null);
    setResultMeta(null);
    setLongWait(false);
    try {
      const outcome = await createVideoJobExecutor()(pendingRequest, {
        signal: new AbortController().signal,
      });
      if (!outcome.ok) {
        setErrorMessage(tGen(generationErrorKey(outcome.code, outcome.reason)));
        setStatus("error");
        return;
      }
      setResult(outcome);
      setResultMeta({
        durationSeconds: outcome.durationSeconds ?? effectiveDuration,
        ratio: effectiveRatio,
      });
      setStatus("success");
      const wallet = await creditsAdapter.getWallet();
      if (wallet.ok) {
        setWalletCredits(
          Math.max(0, wallet.data.credits - (wallet.data.reserved ?? 0)),
        );
      }
    } finally {
      setSubmitting(false);
      setPendingRequest(null);
      setPendingPrice(null);
    }
  };

  const styleGradient =
    selectedStyle?.gradient ?? "from-violet-600 via-purple-950 to-black";

  return (
    <section className="relative pb-24 md:pb-32">
      <div className="mx-auto w-full max-w-[1320px] px-6">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
          <div className="flex min-w-0 flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/50 backdrop-blur md:p-8">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-violet-300">
                {t("eyebrow")}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {t("title")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {t("subtitle")}
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {t("sourceLegend")}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-black/40 p-1">
                {(["text", "image"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={sourceMode === mode}
                    disabled={busy}
                    onClick={() => setSourceMode(mode)}
                    className={`rounded-md px-3 py-2 text-sm transition disabled:opacity-50 ${
                      sourceMode === mode
                        ? "bg-violet-500/25 text-white ring-1 ring-violet-400/50"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {mode === "text" ? t("sourceText") : t("sourceImage")}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                {sourceMode === "text"
                  ? t("sourceTextHint")
                  : t("sourceImageHint")}
              </p>
            </div>

            <div className="mt-6">
              <StylePicker
                styleId={styleId}
                onSelect={setStyleId}
                disabled={busy}
              />
            </div>

            <div className="mt-6">
              <label
                htmlFor="live-prompt"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                {t("sceneLabel")}{" "}
                <span className="font-normal text-zinc-500">
                  {sourceMode === "image" ? t("sceneOptional") : ""}
                </span>
              </label>
              <textarea
                id="live-prompt"
                rows={3}
                value={prompt}
                maxLength={PROMPT_LIMIT}
                readOnly={busy}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t("scenePlaceholder")}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
              />
              <p className="mt-1 text-right text-xs text-zinc-600">
                {prompt.length} / {PROMPT_LIMIT}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                {tGen("autoSceneHint")}
              </p>
            </div>

            {/* Primary flow: the automatic device fit is visible; all
                secondary controls (motion, source image, device, ratio,
                duration) live in one collapsed Advanced group. */}
            <div className="mt-5 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-100">
                    {t("autoFitTitle")}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    {t("autoFitSummary", {
                      device: tDevices(device),
                      ratio: effectiveRatio,
                      seconds: effectiveDuration,
                    })}
                  </p>
                  {sourceMode === "image" ? (
                    <p
                      className={`mt-1 text-xs leading-relaxed ${
                        hasSource ? "text-violet-200/80" : "text-amber-200/90"
                      }`}
                    >
                      {hasSource
                        ? t("sourceChosenSummary", {
                            name: refImage?.name ?? t("sourceImage"),
                          })
                        : t("sourceMissingSummary")}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-expanded={advancedOpen}
                  aria-controls="live-advanced-settings"
                  onClick={() => setAdvancedOpen((value) => !value)}
                  className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-medium text-zinc-300 outline-none transition hover:border-violet-400/40 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/60"
                >
                  {tGen("advancedSettings")}
                  <span className="text-zinc-500">
                    {tGen("advancedOptional")}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    className={`h-3.5 w-3.5 transition-transform ${
                      advancedOpen ? "rotate-180" : ""
                    }`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </div>
            </div>

            <div
              id="live-advanced-settings"
              hidden={!advancedOpen}
              className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {tGen("advancedSettings")}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={resetLiveRecommendation}
                  className="text-xs font-medium text-violet-300 underline-offset-4 transition enabled:hover:text-violet-200 enabled:hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {tGen("advancedReset")}
                </button>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                {tGen("advancedHint")}
              </p>

              <div className="mt-4">
                <div className="mt-4">
                  <label
                    htmlFor="live-motion"
                    className="mb-2 block text-sm font-medium text-zinc-300"
                  >
                    {t("motionLabel")}{" "}
                    <span className="font-normal text-zinc-500">
                      {sourceMode === "image" ? "" : t("motionOptional")}
                    </span>
                  </label>
                  <textarea
                    id="live-motion"
                    rows={3}
                    value={motionPrompt}
                    maxLength={MOTION_LIMIT}
                    readOnly={busy}
                    onChange={(event) => setMotionPrompt(event.target.value)}
                    placeholder={t("motionPlaceholder")}
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
                  />
                  <div className="flex items-start justify-between gap-3">
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                      {t("motionHint")}
                    </p>
                    <p className="mt-1 shrink-0 text-xs text-zinc-600">
                      {motionPrompt.length} / {MOTION_LIMIT}
                    </p>
                  </div>
                </div>

                {sourceMode === "image" ? (
                  <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-4">
                    <p className="text-sm font-medium text-zinc-300">
                      {t("sourceImagesTitle")}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {t("sourceImagesHint")}
                    </p>

                    {refImage ? (
                      <div className="mt-3 flex items-center gap-3 rounded-xl border border-violet-400/40 bg-violet-500/10 p-3">
                        <WallpaperImage
                          src={refImage.url}
                          alt={t("sourcePreviewAlt")}
                          gradient={styleGradient}
                          className="h-14 w-14 shrink-0 rounded-lg object-cover"
                          eager
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-zinc-100">
                            {refImage.name}
                          </p>
                          <p className="text-xs text-violet-200/80">
                            {t("sourceSelected")}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setRefImage(null)}
                          className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:border-white/25 hover:text-white disabled:opacity-50"
                        >
                          {t("sourceRemove")}
                        </button>
                      </div>
                    ) : null}

                    {sourceState === "loading" ? (
                      <p className="mt-3 text-xs text-zinc-500" aria-busy>
                        {t("sourceImagesLoading")}
                      </p>
                    ) : sourceState === "error" ? (
                      <p className="mt-3 text-xs text-amber-300">
                        {t("sourceImagesError")}
                      </p>
                    ) : sourceCreations.length === 0 ? (
                      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                        {t("sourceImagesEmpty")}{" "}
                        <Link
                          href="/my-creations"
                          className="text-violet-300 underline-offset-4 hover:underline"
                        >
                          {t("sourceImagesAction")}
                        </Link>
                      </p>
                    ) : (
                      <ul className="mt-3 grid grid-cols-4 gap-2">
                        {sourceCreations.map((item) => {
                          const selected = sourceCreationId === item.id;
                          return (
                            <li key={item.id}>
                              <button
                                type="button"
                                aria-pressed={selected}
                                disabled={busy}
                                onClick={() => {
                                  setSourceCreationId(item.id);
                                  setRefImage(null);
                                }}
                                className={`w-full overflow-hidden rounded-lg border text-left transition ${
                                  selected
                                    ? "border-violet-400/70 ring-1 ring-violet-400/50"
                                    : "border-white/10 hover:border-white/30"
                                }`}
                              >
                                <WallpaperImage
                                  src={item.imageUrl}
                                  alt={item.prompt || t("sourceImage")}
                                  gradient={styleGradient}
                                  className="aspect-square w-full object-cover"
                                />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {sourceCreationId ? (
                      <p className="mt-2 text-xs text-violet-300">
                        {t("sourceSelected")}
                        {selectedSource?.prompt
                          ? ` · ${selectedSource.prompt}`
                          : ""}
                      </p>
                    ) : null}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        void handleFile(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                    {refError ? (
                      <p role="alert" className="mt-2 text-xs text-red-300">
                        {refError}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-3 min-h-11 w-full rounded-xl border border-dashed border-white/15 bg-black/30 px-4 py-2.5 text-sm text-zinc-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
                    >
                      {t("uploadSource")}
                    </button>
                    <p className="mt-1.5 text-xs text-zinc-600">
                      {t("uploadFormats")}
                    </p>
                  </div>
                ) : null}

                <div className="mt-6">
                  <p className="mb-2 text-sm font-medium text-zinc-300">
                    {t("deviceLegend")}
                  </p>
                  <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
                    {DEVICES.map((id) => {
                      const active = device === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={active}
                          disabled={busy}
                          onClick={() => {
                            setDeviceMode("manual");
                            setDevice(id);
                            // Recommend the provider-supported default for the new device; the user can override it below.
                            setRatio(defaultRatioFor(id, supportedRatios));
                          }}
                          className={`rounded-lg px-2 py-2.5 text-sm transition disabled:opacity-50 ${
                            active
                              ? "bg-violet-500/25 text-white ring-1 ring-violet-400/50"
                              : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                          }`}
                        >
                          {tDevices(id)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5">
                  <p className="mb-2 text-sm font-medium text-zinc-300">
                    {t("ratioLegend")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(supportedRatios.length
                      ? supportedRatios
                      : (["9:16", "16:9", "1:1"] as const)
                    ).map((id) => {
                      const option = ASPECT_RATIOS.find(
                        (item) => item.id === id,
                      );
                      if (!option) return null;
                      const active = effectiveRatio === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={active}
                          disabled={busy || supportedRatios.length === 0}
                          onClick={() => {
                            setDeviceMode("manual");
                            setRatio(id);
                          }}
                          className={`rounded-full border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            active
                              ? "border-violet-400/70 bg-violet-500/20 text-white"
                              : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    {t("outputHint", {
                      resolution: modePricing?.resolution ?? "—",
                    })}
                  </p>
                </div>

                <div className="mt-5">
                  <p className="mb-2 text-sm font-medium text-zinc-300">
                    {t("durationLegend")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {supportedDurations.map((seconds) => {
                      const active = effectiveDuration === seconds;
                      return (
                        <button
                          key={seconds}
                          type="button"
                          aria-pressed={active}
                          disabled={busy}
                          onClick={() => setDuration(seconds)}
                          className={`min-h-10 rounded-full border px-4 py-2 text-sm transition disabled:opacity-50 ${
                            active
                              ? "border-violet-400/70 bg-violet-500/20 text-white"
                              : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                          }`}
                        >
                          {t("durationChoice", { seconds })}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {supportedDurations.length === 1
                      ? t("durationOnly", { seconds: supportedDurations[0] })
                      : t("durationHint")}
                  </p>
                </div>
              </div>
            </div>

            {!videoPricing?.available ? (
              <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5 text-xs leading-relaxed text-amber-200">
                {t("notConfigured")}
              </p>
            ) : videoPricing.mock ? (
              <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5 text-xs leading-relaxed text-amber-200">
                {t("mockMode")}
              </p>
            ) : null}

            <CreditsNotice
              className="mt-5"
              state={noticeState}
              priceCredits={price}
              balance={walletCredits}
            />

            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy || !formValid}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-4 text-sm font-semibold shadow-xl shadow-violet-950/50 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100"
            >
              {busy ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-5 w-5 animate-spin"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="opacity-25"
                  />
                  <path
                    d="M22 12a10 10 0 0 0-10-10"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              ) : null}
              {busy ? t("generating") : t("generateLive")}
            </button>

            {status === "error" && errorMessage ? (
              <div
                role="alert"
                className="mt-4 flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
              >
                <span className="min-w-0 flex-1">{errorMessage}</span>
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="shrink-0 rounded-full border border-red-400/40 px-3 py-1 text-xs text-red-100 hover:bg-red-500/20"
                >
                  {tGen("tryAgain")}
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex w-full min-w-0 flex-col items-center lg:sticky lg:top-28">
            <div
              className={`relative rounded-[1.75rem] border border-white/15 bg-black p-1.5 shadow-2xl shadow-violet-950/40 ${DEVICE_WIDTH[device]} ${
                result ? RATIO_ASPECT[resultMeta?.ratio ?? effectiveRatio] : ""
              }`}
              style={
                !result && selectedDemo
                  ? {
                      aspectRatio: `${selectedDemo.width} / ${selectedDemo.height}`,
                    }
                  : undefined
              }
            >
              <div className="relative h-full w-full overflow-hidden rounded-[1.45rem]">
                {result ? (
                  <LiveVideoPlayer
                    src={result.videoUrl}
                    poster={result.posterUrl}
                    durationSeconds={
                      resultMeta?.durationSeconds ?? result.durationSeconds
                    }
                    label={t("previewResultTitle")}
                    fallbackGradient={styleGradient}
                  />
                ) : selectedDemo ? (
                  <div className="relative h-full w-full">
                    <LiveVideoPlayer
                      key={selectedDemo.id}
                      src={selectedDemo.video}
                      poster={selectedDemo.poster}
                      durationSeconds={selectedDemo.durationSeconds}
                      label={tGallery(`liveDemos.${selectedDemo.id}.alt`)}
                      fallbackGradient={styleGradient}
                    />
                    <span className="pointer-events-none absolute left-3 top-3 rounded-full border border-amber-300/30 bg-black/70 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-200 backdrop-blur">
                      {t("demoBadge")}
                    </span>
                    <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/65 px-2 py-0.5 text-[10px] text-white/75 backdrop-blur">
                      {formatAspectRatio(
                        selectedDemo.width,
                        selectedDemo.height,
                      )}{" "}
                      · {selectedDemo.durationSeconds}s
                    </span>
                  </div>
                ) : (
                  <div
                    className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br ${styleGradient} px-5 text-center`}
                  >
                    <p className="max-w-[24rem] text-base font-medium text-white/90">
                      {t("previewTitle")}
                    </p>
                    <p className="max-w-[24rem] text-sm leading-relaxed text-white/65">
                      {t("previewBody", {
                        seconds: effectiveDuration,
                        ratio: effectiveRatio,
                      })}
                    </p>
                  </div>
                )}
                {device === "phone" && result ? (
                  <div className="absolute left-1/2 top-2.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-black/70" />
                ) : null}
              </div>
            </div>

            <p
              role="status"
              className="mt-5 max-w-[32rem] text-center text-sm leading-relaxed text-zinc-400"
            >
              {status === "generating"
                ? longWait
                  ? tGen("statusLongWait")
                  : t("statusGenerating")
                : status === "error" && result
                  ? tGen("statusErrorKept")
                  : result
                    ? t("statusSuccess")
                    : t("demoPreviewHint")}
            </p>

            {result ? (
              <p className="mt-1 max-w-[32rem] text-center text-xs leading-relaxed text-zinc-500">
                {tGen("retentionNotice")}
              </p>
            ) : null}
            {result?.mock ? (
              <p className="mt-2 max-w-[32rem] text-center text-sm font-medium text-amber-300">
                {tGen("mockResultNote")}
              </p>
            ) : null}

            <p className="mt-1 text-center text-sm text-zinc-400">
              {result
                ? t("resultMeta", {
                    seconds: resultMeta?.durationSeconds ?? effectiveDuration,
                    ratio: resultMeta?.ratio ?? effectiveRatio,
                  })
                : t("autoFitSummary", {
                    device: tDevices(device),
                    ratio: effectiveRatio,
                    seconds: effectiveDuration,
                  })}
            </p>

            {!result && selectedDemo ? (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <label
                  htmlFor="live-demo-select"
                  className="text-xs text-zinc-500"
                >
                  {t("demoSelect")}
                </label>
                <select
                  id="live-demo-select"
                  value={selectedDemo.id}
                  onChange={(event) => {
                    setDemoId(event.target.value);
                    setDemoTouched(true);
                  }}
                  className="min-h-9 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
                >
                  {LIVE_DEMOS.map((demo) => (
                    <option key={demo.id} value={demo.id}>
                      {tGallery(`liveDemos.${demo.id}.title`)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {!result ? (
              <p className="mt-2 max-w-[30rem] text-center text-xs leading-relaxed text-zinc-500">
                {t("demoNote")}
              </p>
            ) : null}

            {result ? (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <a
                  href={result.downloadUrl}
                  download
                  className="min-h-10 rounded-full border border-violet-400/40 bg-violet-500/15 px-4 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/25"
                >
                  {t("downloadMp4")}
                </a>
                <a
                  href={result.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-10 rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/35 hover:text-white"
                >
                  {t("openVideo")}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setResultMeta(null);
                    setStatus("idle");
                    setErrorMessage(null);
                  }}
                  className="min-h-10 rounded-full border border-white/10 px-4 py-1.5 text-xs text-zinc-400 transition hover:border-white/25 hover:text-white"
                >
                  {t("again")}
                </button>
              </div>
            ) : null}

            <p className="mt-4 max-w-[30rem] text-center text-xs leading-relaxed text-zinc-500">
              {t("platformNote")}
            </p>
            <p className="mt-2 max-w-[30rem] text-center text-xs leading-relaxed text-zinc-600">
              {t("providerNote", {
                provider: modePricing?.provider ?? "—",
                resolution: modePricing?.resolution ?? "—",
              })}
            </p>
          </div>
        </div>
      </div>

      <GenerationConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setPendingRequest(null);
          setPendingPrice(null);
        }}
        summary={summary}
        priceCredits={pendingPrice}
        canConfirm={canSubmit}
        creditsMessage={tGen("errorInsufficientCredits")}
        onConfirm={() => void submitVideo()}
        submitting={submitting}
      />
    </section>
  );
}
