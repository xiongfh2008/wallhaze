"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslations } from "next-intl";
import {
  DEMO_SAMPLE_IMAGE,
  STYLE_SELECT_EVENT,
  findStyle,
  type WallStyle,
} from "@/lib/styles";
import {
  GENERAL_PROMPT_EXAMPLES,
  getExamplesForStyle,
  getRandomExample,
} from "@/lib/prompt-examples";
import {
  addGenerationHistory,
  clearGenerationHistory,
  loadGenerationHistory,
  type GenerationHistoryEntry,
} from "@/lib/history";
import {
  favoriteKeyOf,
  getFavoritesSnapshot,
  getServerFavoritesSnapshot,
  removeFavorite,
  subscribeFavorites,
  toggleFavorite,
  type FavoriteEntry,
} from "@/lib/favorites";
import WallpaperImage from "./WallpaperImage";
import Lightbox from "./Lightbox";
import StylePicker from "./StylePicker";
import { HeartIcon } from "./icons";
import {
  downloadImage,
  markDownloading,
  markDownloadFinished,
  timestampedBaseName,
} from "@/lib/download";
import { DownloadIconButton } from "./DownloadIconButton";
import { LANGUAGE_SWITCH_FLAG } from "@/lib/language-bridge";
import {
  ASPECT_RATIOS,
  DEVICE_ALLOWED_RATIOS,
  DEVICE_PRESET_RATIO,
  findSizePreset,
  getDefaultSizePresetForRatio,
  getSizePresetsForRatio,
  isAspectRatioId,
  recommendPresetForScreen,
  type AspectRatioId,
  type HistoryDevice,
  type ScreenPresetRecommendation,
  type SizePreset,
} from "@/lib/sizes";

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

function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
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
  { id: "phone", Icon: PhoneIcon },
  { id: "tablet", Icon: TabletIcon },
  { id: "desktop", Icon: DesktopIcon },
] as const;

/** Preview frame width per device — the frame's aspect comes from the
 * selected ratio (RATIO_ASPECT below), so the preview always matches the
 * real output shape. */
const DEVICE_WIDTH: Record<HistoryDevice, string> = {
  phone: "w-44 md:w-52",
  tablet: "w-60 md:w-72",
  desktop: "w-full max-w-sm",
};

/** Tailwind aspect class per ratio — literal strings so the compiler sees them. */
const RATIO_ASPECT: Record<AspectRatioId, string> = {
  "9:16": "aspect-[9/16]",
  "3:4": "aspect-[3/4]",
  "1:1": "aspect-square",
  "4:3": "aspect-[4/3]",
  "16:9": "aspect-[16/9]",
};

/* ---- Screen detection (client only) ----
   Used purely to suggest a size preset — never sent to the server, never
   applied automatically. Read after mount so SSR/hydration render without
   it and no hydration mismatch can occur. */

interface ScreenInfo {
  width: number;
  height: number;
  pixelRatio?: number;
}

function readScreenInfo(): ScreenInfo | null {
  if (typeof window === "undefined" || !window.screen) return null;
  const { width, height } = window.screen;
  // Guard against zero/nonsense values some embedded browsers report.
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const pixelRatio = window.devicePixelRatio;
  return {
    width,
    height,
    pixelRatio:
      Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : undefined,
  };
}

/** Current screen info, null until mounted (or when the screen is unreadable). */
function useScreenInfo(): ScreenInfo | null {
  const [info, setInfo] = useState<ScreenInfo | null>(null);
  useEffect(() => {
    const update = () => setInfo(readScreenInfo());
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);
  return info;
}

interface RefImage {
  name: string;
  /** Base64 data URI — sent to /api/generate for image-to-image editing. */
  url: string;
}

interface GeneratedImage {
  url: string;
  width: number | null;
  height: number | null;
  /** MIME type reported by the generation API, used for download file names. */
  contentType: string | null;
}

/**
 * Snapshot of the parameters that produced the CURRENT result, bound to the
 * generation itself — never to the live form. The form keeps accepting edits
 * for the next wallpaper, so the preview meta line and the favorite title
 * must read from here to keep describing the image actually on screen.
 */
interface ResultInfo {
  styleId: WallStyle["id"] | null;
  /** English label captured at generation time — fallback when a style is
   *  ever removed; normal rendering resolves styleId through i18n instead. */
  styleLabel: string | null;
  /** Device used for THIS result, resolved through i18n at render time. */
  deviceId: HistoryDevice;
  /** Requested preset size label, used when fal reports no real dimensions. */
  requestedSizeLabel: string | null;
  /** The prompt that produced this image (trimmed). */
  prompt: string;
}

type GenerationStatus = "idle" | "generating" | "success" | "error";

const REF_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const REF_MAX_BYTES = 5 * 1024 * 1024;
/** Mirrors the server-side user-prompt limit (style templates excluded). */
const PROMPT_MAX_LENGTH = 800;

/** Tabs inside the My Library panel below the generator. */
const LIBRARY_TABS = [
  { id: "favorites" },
  { id: "history" },
] as const;

type LibraryTab = (typeof LIBRARY_TABS)[number]["id"];

/** Maps a preset id to its sizePresetLabels message key (8 unique labels
 *  shared by 12 presets, per the "no duplicate copy" rule). */
const PRESET_LABEL_KEYS: Record<string, string> = {
  "phone-1080x1920": "phonePortraitHd",
  "phone-1020x1360": "portraitClassic",
  "phone-1024x1024": "square",
  "tablet-1080x1920": "portraitHd",
  "tablet-1020x1360": "portraitClassic",
  "tablet-1024x1024": "square",
  "tablet-1440x1080": "landscapeClassic",
  "tablet-1920x1080": "landscapeHd",
  "desktop-1920x1080": "desktopFullHd",
  "desktop-1600x1200": "landscapeClassic",
  "desktop-1440x1080": "landscapeCompact",
  "desktop-1024x1024": "square",
};

/** Shape handed across a language switch via the sessionStorage bridge. */
interface GeneratorHandoff {
  prompt: string;
  styleId: WallStyle["id"] | null;
  device: HistoryDevice;
  ratio: AspectRatioId;
  presetId: string | null;
  resultImage: GeneratedImage | null;
  resultInfo: ResultInfo | null;
  hasResult: boolean;
}

/** File-validation failures as codes — the component maps them to i18n text. */
type RefErrorCode = "format" | "empty" | "too-large";

function refFileError(file: File): RefErrorCode | null {
  if (!REF_ALLOWED_TYPES.includes(file.type)) {
    return "format";
  }
  if (file.size === 0) {
    return "empty";
  }
  if (file.size > REF_MAX_BYTES) {
    return "too-large";
  }
  return null;
}

function formatHistoryTime(createdAt: number): string {
  return new Date(createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ---- Generation history store (external system: localStorage) ---- */

const EMPTY_HISTORY: GenerationHistoryEntry[] = [];
let historyCache: GenerationHistoryEntry[] | null = null;
const historyListeners = new Set<() => void>();

function subscribeToHistory(callback: () => void): () => void {
  historyListeners.add(callback);
  return () => {
    historyListeners.delete(callback);
  };
}

// Cached so useSyncExternalStore sees a stable reference between renders.
function getHistorySnapshot(): GenerationHistoryEntry[] {
  if (historyCache === null) {
    historyCache = loadGenerationHistory();
  }
  return historyCache;
}

function getServerHistorySnapshot(): GenerationHistoryEntry[] {
  return EMPTY_HISTORY;
}

function notifyHistoryChanged(): void {
  historyCache = null;
  historyListeners.forEach((listener) => listener());
}

export default function GeneratorSection({
  variant = "home",
}: {
  /**
   * "home" (default) keeps the marketing section exactly as before.
   * "studio" renders the same generator inside the /studio workspace:
   * identical state, requests, ratio config, My Library and downloads —
   * only the section heading (owned by the studio page) and spacing differ.
   */
  variant?: "home" | "studio";
}) {
  const isStudio = variant === "studio";
  const t = useTranslations("generator");
  const tCommon = useTranslations("common");
  const tDevices = useTranslations("devices");
  const tStyles = useTranslations("styleLabels");
  const tPresets = useTranslations("sizePresetLabels");
  const [styleId, setStyleId] = useState<WallStyle["id"] | null>(null);
  const [device, setDevice] = useState<HistoryDevice>("phone");
  const [ratio, setRatio] = useState<AspectRatioId>(DEVICE_PRESET_RATIO.phone);
  // Resolution preset selection. null = "model default" (the official fal
  // enum size — the exact behavior from before presets existed). Any preset
  // click switches to an exact custom {width,height} size from lib/sizes.ts.
  const [presetId, setPresetId] = useState<string | null>(null);
  // Inspiration: an example staged behind the Replace/Append/Cancel confirm
  // row. pendingBase snapshots the prompt at pick time so the row can warn
  // when the text has changed since. Nothing is applied without a click.
  const [pendingExample, setPendingExample] = useState<string | null>(null);
  const [pendingBase, setPendingBase] = useState("");
  const [promptNotice, setPromptNotice] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [refImage, setRefImage] = useState<RefImage | null>(null);
  const [refError, setRefError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Collapsible groups keep the left panel short: device/ratio/resolution and
  // the reference image collapse by default, always showing the current choice
  // in their headers. All values live in the parent state, so collapsing
  // never loses a selection.
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [resultImage, setResultImage] = useState<GeneratedImage | null>(null);
  // Set together with resultImage on success and on history restore; see
  // the ResultInfo interface for why the form state must not be used here.
  const [resultInfo, setResultInfo] = useState<ResultInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // History lives in localStorage (an external system) and is read through
  // useSyncExternalStore: SSR/hydration render the empty snapshot first, then
  // React re-renders with the client snapshot — no hydration mismatch and no
  // setState-in-effect cascades.
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  // Full-size preview of the current result. Pure display state — opening
  // or closing it never touches the form or fires any request.
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Escalating wait state for the generating caption — an honest "still
  // working" line after ~15s, never a fabricated progress value.
  const [longWait, setLongWait] = useState(false);
  // Bumped on every new generation request; the wait-timer effect re-arms
  // whenever it changes. (A plain counter keeps the purity rule happy —
  // no Date.now() in the component body.)
  const [generationSeq, setGenerationSeq] = useState(0);
  // "Image failed" marks shared by both library lists (favorites + history).
  const [failedThumbIds, setFailedThumbIds] = useState<ReadonlySet<string>>(
    new Set()
  );
  const history = useSyncExternalStore(
    subscribeToHistory,
    getHistorySnapshot,
    getServerHistorySnapshot
  );
  // Favorites live in the same kind of external localStorage store as
  // history and are shared with the gallery, so every heart stays in sync.
  const favorites = useSyncExternalStore(
    subscribeFavorites,
    getFavoritesSnapshot,
    getServerFavoritesSnapshot
  );
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("favorites");
  const [favoriteNotice, setFavoriteNotice] = useState<string | null>(null);
  // Download UX: single-flight guard plus a tone-tagged feedback message.
  const [downloading, setDownloading] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<{
    message: string;
    tone: "success" | "warning";
  } | null>(null);
  // Per-entry download state for the Favorites list — downloading one entry
  // never disables the others.
  const [downloadingIds, setDownloadingIds] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [libraryNotice, setLibraryNotice] = useState<{
    message: string;
    tone: "success" | "warning";
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Frame around the current preview — scrolled into view on small screens
  // after a successful generation (see revealResultOnMobile).
  const previewFrameRef = useRef<HTMLDivElement>(null);

  // Style cards in the gallery dispatch this event to preselect a style here.
  useEffect(() => {
    const onStyleSelect = (event: Event) => {
      const style = findStyle((event as CustomEvent<string>).detail);
      if (style) {
        setStyleId(style.id);
        // The style context changed — drop any staged inspiration example.
        setPendingExample(null);
        setPromptNotice(null);
      }
    };
    window.addEventListener(STYLE_SELECT_EVENT, onStyleSelect);
    return () => window.removeEventListener(STYLE_SELECT_EVENT, onStyleSelect);
  }, []);

  /* ---- Language-switch handoff ----
     Switching locales remounts this component. When the LanguageSwitcher
     sets the pending flag, the unmount cleanup below saves the editor state
     (small serializable values only — never the base64 reference image) and
     the mount effect restores it on the other side of the navigation. */

  // Restore on mount (once).
  /* eslint-disable react-hooks/set-state-in-effect -- one-shot hydration of
     handoff state from sessionStorage: lazy initializers are impossible (SSR
     must render the empty state first to avoid a hydration mismatch) and
     there is no user event this restore could be attached to. */
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(LANGUAGE_SWITCH_FLAG);
      if (!raw) return;
      window.sessionStorage.removeItem(LANGUAGE_SWITCH_FLAG);
      const saved = JSON.parse(raw) as Partial<GeneratorHandoff> | null;
      if (!saved) return;
      setPrompt(typeof saved.prompt === "string" ? saved.prompt : "");
      if (saved.styleId && findStyle(saved.styleId)) {
        setStyleId(saved.styleId);
      }
      if (
        saved.device &&
        saved.ratio &&
        DEVICE_ALLOWED_RATIOS[saved.device].includes(saved.ratio)
      ) {
        setDevice(saved.device);
        setRatio(saved.ratio);
        setPresetId(
          saved.presetId && findSizePreset(saved.presetId)
            ? saved.presetId
            : null
        );
      }
      if (saved.hasResult && saved.resultImage?.url) {
        setResultImage(saved.resultImage);
        setResultInfo(saved.resultInfo ?? null);
        setStatus("success");
        setPreviewImageFailed(false);
      }
    } catch {
      // Malformed bridge data — start fresh instead of crashing.
      try {
        window.sessionStorage.removeItem(LANGUAGE_SWITCH_FLAG);
      } catch {
        // ignore
      }
    }
    // Run once on mount only.
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Save on unmount while a language switch is in flight. The cleanup runs
  // with the latest state (it is re-created on every state change).
  useEffect(() => {
    return () => {
      try {
        if (!window.sessionStorage.getItem(LANGUAGE_SWITCH_FLAG)) return;
        const handoff: GeneratorHandoff = {
          prompt,
          styleId,
          device,
          ratio,
          presetId,
          resultImage,
          resultInfo,
          hasResult: resultImage !== null && status === "success",
        };
        window.sessionStorage.setItem(
          LANGUAGE_SWITCH_FLAG,
          JSON.stringify(handoff)
        );
      } catch {
        // Storage unavailable — the switch proceeds without state handoff.
      }
    };
  }, [prompt, styleId, device, ratio, presetId, resultImage, resultInfo, status]);

  // Escalating wait notice: after ~15s of "generating" the caption switches
  // to an honest "still working" line (the sync fal endpoint exposes no real
  // stages, so nothing fancier is claimed). setState only ever happens in
  // the timeout callback — never during the effect body. The timer is
  // cleared when the status leaves "generating" and on unmount; every new
  // request bumps generationSeq, which re-arms it.
  useEffect(() => {
    if (status !== "generating") return;
    const timer = window.setTimeout(() => setLongWait(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [status, generationSeq]);

  const selectedStyle = styleId ? findStyle(styleId) : undefined;
  const selectedPreset = presetId ? findSizePreset(presetId) : null;
  // Screen info arrives only after mount; the recommendation is derived
  // from the currently selected target device. It is display-only — the
  // user applies it explicitly, so updates never override manual choices.
  const screenInfo = useScreenInfo();
  const screenRecommendation = useMemo(
    () =>
      screenInfo
        ? recommendPresetForScreen(
            screenInfo.width,
            screenInfo.height,
            device,
            screenInfo.pixelRatio
          )
        : null,
    [screenInfo, device]
  );
  // While a generation is in flight, every input that composes the request is
  // locked so the incoming result always matches what the user sees selected.
  const busy = status === "generating";
  const previewSrc =
    resultImage?.url ?? selectedStyle?.image ?? DEMO_SAMPLE_IMAGE;
  const previewGradient =
    selectedStyle?.gradient ?? "from-violet-600 via-purple-950 to-black";
  // The visible generation result maps to one stable favorite key, so
  // re-favoriting the same image toggles instead of duplicating.
  const resultFavoriteKey = resultImage
    ? favoriteKeyOf("generated", null, resultImage.url)
    : null;
  const resultIsFavorite = favorites.some(
    (favorite) => favorite.key === resultFavoriteKey
  );
  // Output size shown next to the result: the real dimensions fal returned
  // win over the requested preset's dimensions (the model can slightly
  // adjust a custom size).
  const resultSizeLabel = resultImage
    ? resultImage.width != null && resultImage.height != null
      ? `${resultImage.width} × ${resultImage.height}`
      : resultInfo?.requestedSizeLabel ?? null
    : null;
  // Preview meta line: with a result on screen it describes THAT result's
  // captured parameters (resolved through i18n from the snapshot ids);
  // without one it describes the current selection (what the next
  // generation would use).
  const selectedDeviceLabel = tDevices(device);
  const metaStyleLabel = resultImage
    ? resultInfo
      ? resultInfo.styleId
        ? tStyles(resultInfo.styleId)
        : resultInfo.styleLabel
      : selectedStyle
        ? tStyles(selectedStyle.id)
        : null
    : selectedStyle
      ? tStyles(selectedStyle.id)
      : null;
  const metaDeviceLabel = resultImage
    ? resultInfo
      ? tDevices(resultInfo.deviceId)
      : selectedDeviceLabel
    : selectedDeviceLabel;
  const presetLabel = (preset: SizePreset) =>
    tPresets(PRESET_LABEL_KEYS[preset.id] ?? preset.id);

  // One-line summary for the collapsed device/resolution group header —
  // the current choice stays visible without expanding the panel.
  const deviceSummary = `${selectedDeviceLabel} · ${ratio} · ${
    selectedPreset ? presetLabel(selectedPreset) : t("modelDefault")
  }`;

  const handleFile = (file: File | null | undefined) => {
    if (busy || !file) return;
    const problem = refFileError(file);
    if (problem) {
      setRefError(
        problem === "format"
          ? t("refUnsupportedFormat")
          : problem === "empty"
            ? t("refEmptyFile")
            : t("refTooLarge")
      );
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
        setRefError(t("refReadFailed"));
      }
    };
    reader.onerror = () => setRefError(t("refReadFailed"));
    reader.readAsDataURL(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    handleFile(event.dataTransfer.files?.[0]);
  };

  // Scrolls the preview frame into view on narrow viewports after a
  // successful generation. Desktop (lg+) is excluded — its sticky preview
  // column is always on screen and must not be yanked around. Honors
  // prefers-reduced-motion; the frame element exists in every status, so
  // the call cannot race with React's render commit.
  const revealResultOnMobile = () => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    previewFrameRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
    });
  };

  const handleGenerate = async () => {
    if (status === "generating") return;
    cancelPendingExample();
    if (prompt.length > PROMPT_MAX_LENGTH) {
      setErrorMessage(t("promptTooLong", { limit: PROMPT_MAX_LENGTH }));
      setStatus("error");
      return;
    }
    setStatus("generating");
    setErrorMessage(null);
    // (Re)arm the wait-escalation timer for this request.
    setGenerationSeq((seq) => seq + 1);
    setLongWait(false);
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
          aspectRatio: ratio,
          sizePresetId: presetId,
          refImage: refImage?.url,
        }),
      });
      // Invalid/non-JSON bodies (e.g. gateway error pages) resolve to null
      // instead of throwing, so every branch below can react precisely.
      const data = (await response.json().catch(() => null)) as {
        imageUrl?: string;
        width?: number | null;
        height?: number | null;
        contentType?: string | null;
        error?: string;
      } | null;
      if (!response.ok) {
        setErrorMessage(data?.error ?? t("generateFailed"));
        setStatus("error");
        return;
      }
      if (!data?.imageUrl) {
        setErrorMessage(data?.error ?? t("invalidResponse"));
        setStatus("error");
        return;
      }
      setResultImage({
        url: data.imageUrl,
        width: data.width ?? null,
        height: data.height ?? null,
        contentType: data.contentType ?? null,
      });
      setDownloadNotice(null);
      // Persist the successful generation locally. Storage failures must
      // never turn a successful generation into an error —
      // addGenerationHistory returns null instead of throwing.
      const historyEntry = addGenerationHistory({
        prompt: prompt.trim(),
        styleId,
        device,
        ratio,
        sizePresetId: presetId,
        imageUrl: data.imageUrl,
        width: data.width ?? null,
        height: data.height ?? null,
        hasReferenceImage: refImage !== null,
      });
      if (historyEntry) {
        notifyHistoryChanged();
      }
      setPreviewImageFailed(false);
      // Freeze this result's origin: the form may change for the next run,
      // but preview meta and the favorite title must keep describing THIS
      // image (see ResultInfo).
      setResultInfo({
        styleId: styleId,
        styleLabel: selectedStyle?.label ?? null,
        deviceId: device,
        requestedSizeLabel: selectedPreset
          ? `${selectedPreset.width} × ${selectedPreset.height}`
          : null,
        prompt: prompt.trim(),
      });
      setStatus("success");
      // Small screens only: bring the finished result into view. Errors
      // never scroll — the banner sits right under the Generate button
      // where the user already is.
      revealResultOnMobile();
    } catch {
      // Only genuine request failures (offline, aborted) land here.
      setErrorMessage(t("networkError"));
      setStatus("error");
    }
  };

  // Downloads the current result through the shared helper. Never silent:
  // every outcome maps to a visible, honest message ("opened" ≠ "saved").
  const handleDownload = async () => {
    if (!resultImage || downloading) return;
    setDownloading(true);
    setDownloadNotice(null);
    try {
      const outcome = await downloadImage({
        url: resultImage.url,
        baseName: timestampedBaseName("wallhaze-wallpaper"),
        fallbackMime: resultImage.contentType,
      });
      if (outcome === "downloaded") {
        setDownloadNotice({
          message: t("downloadSaved"),
          tone: "success",
        });
      } else if (outcome === "opened") {
        setDownloadNotice({
          message: tCommon("downloadOpened"),
          tone: "warning",
        });
      } else {
        setDownloadNotice({
          message: tCommon("downloadFailed"),
          tone: "warning",
        });
      }
    } catch {
      // Defensive: downloadImage is designed not to reject, but any surprise
      // failure must not surface as an unhandled promise rejection.
      setDownloadNotice({
        message: tCommon("downloadFailed"),
        tone: "warning",
      });
    } finally {
      setDownloading(false);
    }
  };

  // Downloads a favorite's stored image URL (gallery or generated). Only
  // touches the download helper — never favorites, history or generation.
  // The file name is source + timestamp: never the title/prompt (user
  // input) and never the remote URL.
  const handleDownloadFavorite = async (entry: FavoriteEntry) => {
    if (downloadingIds.has(entry.id)) return;
    setDownloadingIds((current) => markDownloading(current, entry.id));
    setLibraryNotice(null);
    try {
      const outcome = await downloadImage({
        url: entry.imageUrl,
        baseName: timestampedBaseName(`wallhaze-${entry.source}`),
      });
      if (outcome === "downloaded") {
        setLibraryNotice({
          message: t("downloadSaved"),
          tone: "success",
        });
      } else if (outcome === "opened") {
        setLibraryNotice({
          message: tCommon("downloadOpened"),
          tone: "warning",
        });
      } else {
        setLibraryNotice({
          message: tCommon("downloadFailed"),
          tone: "warning",
        });
      }
    } catch {
      // Defensive: downloadImage is designed not to reject, but any surprise
      // failure must not surface as an unhandled promise rejection.
      setLibraryNotice({
        message: tCommon("downloadFailed"),
        tone: "warning",
      });
    } finally {
      setDownloadingIds((current) => markDownloadFinished(current, entry.id));
    }
  };

  // Restores a history entry into the editor and the preview. Never triggers
  // a generation request, and never bypasses the in-flight parameter lock.
  const handleRestoreHistory = (entry: GenerationHistoryEntry) => {
    if (busy) return;
    // The prompt is the only unsaved creation content a restore replaces —
    // ask before overwriting it (style/device choices are cheap to redo).
    if (prompt.trim() !== "" && prompt.trim() !== entry.prompt.trim()) {
      if (!window.confirm(t("restoreConfirm"))) {
        return;
      }
    }
    cancelPendingExample();
    setPrompt(entry.prompt.slice(0, PROMPT_MAX_LENGTH));
    setStyleId(entry.styleId);
    setDevice(entry.device);
    // Restore the stored ratio when it is still valid for this device;
    // legacy entries (no ratio) and invalid/stale values fall back to the
    // device's preset ratio instead of discarding the record.
    const restoredRatio =
      isAspectRatioId(entry.ratio) &&
      DEVICE_ALLOWED_RATIOS[entry.device].includes(entry.ratio)
        ? entry.ratio
        : DEVICE_PRESET_RATIO[entry.device];
    setRatio(restoredRatio);
    // Same for the resolution preset: only kept when it still exists,
    // belongs to this device and agrees with the restored ratio — otherwise
    // fall back to the model default instead of dropping the record.
    const restoredPreset = entry.sizePresetId
      ? findSizePreset(entry.sizePresetId)
      : null;
    setPresetId(
      restoredPreset &&
        restoredPreset.device === entry.device &&
        restoredPreset.ratio === restoredRatio
        ? restoredPreset.id
        : null
    );
    setResultImage({
      url: entry.imageUrl,
      width: entry.width,
      height: entry.height,
      // History entries do not store the MIME type — the fetched Blob's own
      // type decides the download extension instead.
      contentType: null,
    });
    // Same snapshot rule as a fresh generation: the restored preview keeps
    // describing the restored entry, not whatever the form held before.
    const restoredStyle = entry.styleId ? findStyle(entry.styleId) : undefined;
    setResultInfo({
      styleId: entry.styleId,
      styleLabel: restoredStyle?.label ?? null,
      deviceId: entry.device,
      requestedSizeLabel:
        restoredPreset &&
        restoredPreset.device === entry.device &&
        restoredPreset.ratio === restoredRatio
          ? `${restoredPreset.width} × ${restoredPreset.height}`
          : null,
      prompt: entry.prompt,
    });
    setErrorMessage(null);
    setPreviewImageFailed(false);
    setDownloadNotice(null);
    setStatus("success");
  };

  const handleClearHistory = () => {
    if (history.length === 0) return;
    if (!window.confirm(t("clearHistoryConfirm"))) {
      return;
    }
    const historyIds = new Set(history.map((entry) => entry.id));
    clearGenerationHistory();
    notifyHistoryChanged();
    // Only drop failure marks belonging to history — favorites share this
    // set and their records must stay untouched.
    setFailedThumbIds((current) => {
      const next = new Set<string>();
      current.forEach((id) => {
        if (!historyIds.has(id)) next.add(id);
      });
      return next;
    });
  };

  const markThumbImageFailed = (id: string) => {
    setFailedThumbIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  // Switching devices keeps the selected ratio when the new device allows
  // it, and falls back to the new device's preset ratio otherwise — users
  // never see (or get stuck on) a ratio their device cannot use. Presets
  // are device-scoped, so the selection falls back to the new device's
  // default preset for the kept ratio (or the model default when it has
  // none).
  const handleDeviceChange = (next: HistoryDevice) => {
    const nextRatio = DEVICE_ALLOWED_RATIOS[next].includes(ratio)
      ? ratio
      : DEVICE_PRESET_RATIO[next];
    setDevice(next);
    setRatio(nextRatio);
    setPresetId(getDefaultSizePresetForRatio(next, nextRatio)?.id ?? null);
  };

  // Picking a ratio clears any preset: the model default for the new shape
  // is used until the user selects an exact resolution below.
  const handleRatioChange = (next: AspectRatioId) => {
    setRatio(next);
    setPresetId(null);
  };

  // Selecting a resolution preset also syncs its (exactly matching) ratio,
  // keeping the preview frame and the request payload in step.
  const handlePresetSelect = (preset: SizePreset) => {
    setPresetId(preset.id);
    setRatio(preset.ratio);
  };

  // Applies the screen-based suggestion on an explicit click — device,
  // ratio and preset move together. Never invoked automatically.
  const applyScreenRecommendation = (
    recommendation: ScreenPresetRecommendation
  ) => {
    if (busy) return;
    setDevice(recommendation.preset.device);
    setRatio(recommendation.preset.ratio);
    setPresetId(recommendation.preset.id);
  };

  /* ---- Inspiration examples ---- */

  const cancelPendingExample = () => {
    setPendingExample(null);
    setPromptNotice(null);
  };

  // Picks an inspiration example. An empty prompt is filled directly; an
  // existing prompt is never touched until the user confirms. Selecting an
  // example never triggers a generation.
  const handleExamplePick = (text: string) => {
    if (busy) return;
    setPromptNotice(null);
    if (prompt.trim() === "") {
      setPrompt(text.slice(0, PROMPT_MAX_LENGTH));
      setPendingExample(null);
      return;
    }
    setPendingExample(text);
    setPendingBase(prompt);
  };

  const applyExampleReplace = () => {
    if (!pendingExample) return;
    setPrompt(pendingExample.slice(0, PROMPT_MAX_LENGTH));
    cancelPendingExample();
  };

  // Append always builds on the CURRENT text (never the pick-time snapshot),
  // so edits made while the confirm row is open cannot be lost. An append
  // that would exceed the limit is refused without touching the prompt.
  const applyExampleAppend = () => {
    if (!pendingExample) return;
    const combined = `${prompt}\n\n${pendingExample}`;
    if (combined.length > PROMPT_MAX_LENGTH) {
      setPromptNotice(t("appendExceedsLimit", { limit: PROMPT_MAX_LENGTH }));
      return;
    }
    setPrompt(combined);
    cancelPendingExample();
  };

  // Style selection wrapper: clears any staged example, since its style
  // context just changed. The user's own prompt is never modified here.
  const handleStyleSelect = (id: WallStyle["id"] | null) => {
    setStyleId(id);
    cancelPendingExample();
  };

  // Toggles the favorite state of the current generation result. Same image
  // URL = same entry (no duplicates); reference image data is never stored.
  const handleToggleResultFavorite = () => {
    if (!resultImage) return;
    const outcome = toggleFavorite({
      key: favoriteKeyOf("generated", null, resultImage.url),
      source: "generated",
      sourceId: null,
      // The favorite describes the image on screen — its generation-time
      // prompt, never whatever text the form holds right now.
      title:
        resultInfo?.prompt ||
        metaStyleLabel ||
        t("generatedFallbackTitle"),
      imageUrl: resultImage.url,
      // Snapshot values: the style the image was generated with, not the
      // current picker state.
      styleId: resultInfo?.styleId ?? styleId,
      device,
      ratio,
      sizePresetId: presetId,
      width: resultImage.width,
      height: resultImage.height,
    });
    if (outcome === "limit-reached") {
      setFavoriteNotice(tCommon("favoriteLimit"));
    } else if (outcome === "unavailable") {
      setFavoriteNotice(tCommon("favoritesUnavailable"));
    } else {
      setFavoriteNotice(null);
    }
  };

  return (
    <section
      id="generator"
      className={`relative ${isStudio ? "pb-24 md:pb-32" : "py-24 md:py-32"}`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-pulse-glow absolute left-1/2 top-0 h-[420px] w-[680px] max-w-full -translate-x-1/2 rounded-full bg-violet-700/20 blur-[140px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        {!isStudio && (
          <div className="mb-12 max-w-2xl md:mb-14">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
              {t("homeEyebrow")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
              {t("homeTitle")}
            </h2>
            <p className="mt-4 leading-relaxed text-zinc-400">
              {t("homeSubtitle")}
            </p>
          </div>
        )}

        {/* items-start (not items-center) pins the preview column to the top
            of the row, so it is visible without scrolling on desktop and the
            lg:sticky offset engages immediately. */}
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
          {/* Generator panel */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/50 backdrop-blur md:p-8">
            <StylePicker
              styleId={styleId}
              onSelect={handleStyleSelect}
              disabled={busy}
            />

            {/* Device & resolution: collapsible group. The header always
                shows the current device · ratio · size choice, so the state
                stays readable while collapsed. */}
            <div className="mt-8 rounded-xl border border-white/10 bg-black/30">
              <button
                type="button"
                aria-expanded={deviceOpen}
                aria-controls="generator-device-options"
                onClick={() => setDeviceOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left outline-none transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-violet-400/60"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-zinc-300">
                    {t("deviceGroupLabel")}
                  </span>
                  <span className="truncate text-xs text-zinc-500">
                    {deviceSummary}
                  </span>
                </span>
                <ChevronDownIcon
                  className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${
                    deviceOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {deviceOpen && (
                <div
                  id="generator-device-options"
                  className="border-t border-white/10 px-4 pb-5 pt-5"
                >
                  <fieldset>
                    <legend className="mb-3 text-sm font-medium text-zinc-300">
                      {t("deviceLegend")}
                    </legend>
                    <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
                      {DEVICES.map(({ id, Icon }) => {
                        const active = device === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            aria-pressed={active}
                            disabled={busy}
                            onClick={() => handleDeviceChange(id)}
                            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              active
                                ? "bg-violet-500/25 text-white ring-1 ring-violet-400/50"
                                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            {tDevices(id)}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset className="mt-8">
                    <legend className="mb-3 text-sm font-medium text-zinc-300">
                      {t("ratioLegend")}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {ASPECT_RATIOS.filter(({ id }) =>
                        DEVICE_ALLOWED_RATIOS[device].includes(id)
                      ).map(({ id, label }) => {
                        const active = ratio === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            aria-pressed={active}
                            disabled={busy}
                            onClick={() => handleRatioChange(id)}
                            className={`rounded-full border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              active
                                ? "border-violet-400/70 bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.35)]"
                                : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset className="mt-8">
                    <legend className="mb-3 text-sm font-medium text-zinc-300">
                      {t("resolutionLegend")}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {/* "Model default" = the official fal enum size — the
                          exact behavior presets existed. Always available. */}
                      <button
                        type="button"
                        aria-pressed={presetId === null}
                        disabled={busy}
                        onClick={() => setPresetId(null)}
                        className={`rounded-full border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          presetId === null
                            ? "border-violet-400/70 bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.35)]"
                            : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                        }`}
                      >
                        {t("modelDefault")}
                      </button>
                      {getSizePresetsForRatio(device, ratio).map((preset) => {
                        const active = presetId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            aria-pressed={active}
                            disabled={busy}
                            onClick={() => handlePresetSelect(preset)}
                            className={`rounded-full border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              active
                                ? "border-violet-400/70 bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.35)]"
                                : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                            }`}
                          >
                            {presetLabel(preset)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      {selectedPreset
                        ? t("presetSizeLine", {
                            label: presetLabel(selectedPreset),
                            width: selectedPreset.width,
                            height: selectedPreset.height,
                          })
                        : t("modelDefaultHint")}
                    </p>
                  </fieldset>

                  {/* Screen-based suggestion. Rendered only after mount (never
                      on the server), display-only until the user clicks —
                      resize updates the suggestion but never overrides a
                      manual choice. */}
                  {screenRecommendation && (
                    <div className="mt-4 rounded-xl border border-violet-400/30 bg-violet-500/[0.07] px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-violet-200">
                        {t("screenRecommendTitle")}
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                        {presetLabel(screenRecommendation.preset)} ·{" "}
                        {screenRecommendation.preset.ratio} ·{" "}
                        {screenRecommendation.preset.width} ×{" "}
                        {screenRecommendation.preset.height} px
                        <span className="text-zinc-600">
                          {" "}
                          {t("screenRecommendFor", {
                            device: selectedDeviceLabel,
                          })}
                        </span>
                      </p>
                      {!screenRecommendation.exactMatch && (
                        <p className="mt-1 text-xs text-amber-300/90">
                          {t("screenRecommendNoExact")}
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          applyScreenRecommendation(screenRecommendation)
                        }
                        className="mt-2.5 rounded-full border border-violet-400/40 bg-violet-500/15 px-4 py-1.5 text-xs font-medium text-violet-200 transition enabled:hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("useThisSize")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-8">
              <label
                htmlFor="wallpaper-prompt"
                className="mb-3 block text-sm font-medium text-zinc-300"
              >
                {t("promptLabel")}{" "}
                <span className="font-normal text-zinc-500">{t("optional")}</span>
              </label>
              <textarea
                id="wallpaper-prompt"
                rows={3}
                value={prompt}
                maxLength={PROMPT_MAX_LENGTH}
                readOnly={busy}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t("promptPlaceholder")}
                className={`w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20 ${
                  busy ? "cursor-not-allowed opacity-70" : ""
                }`}
              />
              <p className="mt-1.5 text-right text-xs text-zinc-600">
                {prompt.length} / {PROMPT_MAX_LENGTH}
              </p>

              {/* Inspiration: static local examples. With a style selected it
                  shows that style's two prompts, otherwise general ideas. */}
              <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {t("inspiration")}
                    {selectedStyle && (
                      <span className="ml-2 normal-case tracking-normal text-zinc-600">
                        {t("inspirationFor", { style: tStyles(selectedStyle.id) })}
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      handleExamplePick(getRandomExample(styleId))
                    }
                    className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-violet-300 transition enabled:hover:border-violet-400/40 enabled:hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("randomInspiration")}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(styleId
                    ? getExamplesForStyle(styleId)
                    : GENERAL_PROMPT_EXAMPLES
                  ).map((text) => (
                    <button
                      key={text}
                      type="button"
                      disabled={busy}
                      onClick={() => handleExamplePick(text)}
                      title={text}
                      className={`max-w-full truncate rounded-lg border px-3 py-1.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        pendingExample === text
                          ? "border-violet-400/70 bg-violet-500/20 text-violet-100"
                          : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                      }`}
                    >
                      {text}
                    </button>
                  ))}
                </div>

                {/* Confirm row: the user's current prompt is untouched until
                    an explicit action. Append always builds on the current
                    text; a stale pick just gets a heads-up. */}
                {pendingExample && (
                  <div className="mt-3 rounded-lg border border-violet-400/30 bg-violet-500/[0.07] px-3 py-2.5">
                    <p className="text-xs text-zinc-300">
                      {t("useExampleConfirm")}
                    </p>
                    {prompt !== pendingBase && (
                      <p className="mt-1 text-xs text-amber-300/90">
                        {t("promptChangedNotice")}
                      </p>
                    )}
                    {promptNotice && (
                      <p
                        role="alert"
                        className="mt-1 text-xs font-medium text-red-300"
                      >
                        {promptNotice}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={applyExampleReplace}
                        className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3.5 py-1.5 text-xs font-semibold transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("replace")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={applyExampleAppend}
                        className="rounded-full border border-violet-400/40 bg-violet-500/15 px-3.5 py-1.5 text-xs font-medium text-violet-200 transition enabled:hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("append")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={cancelPendingExample}
                        className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-zinc-400 transition enabled:hover:border-white/25 enabled:hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Reference image: collapsible group. The header shows whether
                an image is attached (filename) or that none is set yet. */}
            <div className="mt-6 rounded-xl border border-white/10 bg-black/30">
              <button
                type="button"
                aria-expanded={refOpen}
                aria-controls="generator-reference-options"
                onClick={() => setRefOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left outline-none transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-violet-400/60"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-zinc-300">
                    {t("referenceLegend")}{" "}
                    <span className="font-normal text-zinc-500">
                      {t("optional")}
                    </span>
                  </span>
                  <span
                    className={`truncate text-xs ${
                      refImage ? "text-violet-300/90" : "text-zinc-500"
                    }`}
                  >
                    {refImage ? refImage.name : t("refNoImage")}
                  </span>
                </span>
                <ChevronDownIcon
                  className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${
                    refOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {refOpen && (
                <div
                  id="generator-reference-options"
                  className="border-t border-white/10 px-4 pb-4 pt-4"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={busy}
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
                        alt={t("refPreviewAlt")}
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-zinc-200">
                          {refImage.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {t("refWillBeUsed")}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setRefImage(null);
                          setRefError(null);
                        }}
                        className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/25 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("remove")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (busy) return;
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={handleDrop}
                      disabled={busy}
                      className={`flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        dragging
                          ? "border-violet-400/70 bg-violet-500/10"
                          : "border-white/15 bg-black/30 hover:border-white/30 hover:bg-white/[0.04]"
                      }`}
                    >
                      <UploadIcon className="h-6 w-6 text-zinc-400" />
                      <span className="text-sm font-medium text-zinc-200">
                        {t("uploadTitle")}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {t("uploadFormats")}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {t("uploadHint")}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy}
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
              {status === "generating" ? t("generating") : t("generate")}
            </button>

            {status === "error" && errorMessage && (
              <div
                role="alert"
                className="animate-rise-in mt-4 flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
              >
                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                {/* Retry starts a NEW generation request from the current
                    form values — it never resumes the failed server-side
                    attempt. handleGenerate's busy guard prevents double
                    submits while a retry is in flight. */}
                <p className="min-w-0 flex-1">{errorMessage}</p>
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="shrink-0 rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1 text-xs font-medium text-red-100 transition hover:bg-red-500/25"
                >
                  {t("tryAgain")}
                </button>
              </div>
            )}
          </div>

          {/* Device preview */}
          <div className="flex flex-col items-center lg:sticky lg:top-28">
            <div
              ref={previewFrameRef}
              className={`relative rounded-[1.75rem] border border-white/15 bg-black p-1.5 shadow-2xl shadow-violet-950/40 transition-all duration-300 ${DEVICE_WIDTH[device]} ${RATIO_ASPECT[ratio]}`}
            >
              <div className="relative h-full w-full overflow-hidden rounded-[1.45rem]">
                <WallpaperImage
                  key={previewSrc}
                  src={previewSrc}
                  alt={
                    resultImage
                      ? t("previewAltGenerated")
                      : t("previewAltSample", {
                          style: selectedStyle
                            ? tStyles(selectedStyle.id)
                            : t("noStyle"),
                        })
                  }
                  gradient={previewGradient}
                  className="h-full w-full object-cover"
                  onError={() => setPreviewImageFailed(true)}
                />
                {device === "phone" && (
                  <div className="absolute left-1/2 top-2.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-black/70" />
                )}
                {/* Click-to-zoom on a finished result. Hidden while the
                    preview itself failed — the Lightbox would only show the
                    same gradient fallback. */}
                {resultImage && !busy && !previewImageFailed && (
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    aria-label={t("viewFullSizeAria")}
                    className="absolute inset-0 z-10 cursor-zoom-in rounded-[1.45rem] outline-none transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-violet-400/80"
                  />
                )}
              </div>
            </div>
            {/* role="status": a polite live region so assistive tech hears
                the generating → success/error transitions (failures are also
                announced by the banner's role="alert"). Every branch is
                honest about what is on screen — including the previous
                result after a failed new request. */}
            <p
              role="status"
              className="mt-5 max-w-[16rem] text-center text-xs leading-relaxed text-zinc-500"
            >
              {status === "generating"
                ? longWait
                  ? t("statusLongWait")
                  : t("statusGenerating")
                : status === "error" && resultImage
                  ? t("statusErrorKept")
                  : resultImage
                    ? t("statusSuccess")
                    : t("statusDemo")}
            </p>
            {resultImage && previewImageFailed && (
              <p className="mt-2 max-w-[18rem] text-center text-xs text-amber-300/90">
                {t("imageGoneNotice")}
              </p>
            )}
            {resultImage && status !== "generating" && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleResultFavorite}
                  aria-pressed={resultIsFavorite}
                  aria-label={
                    resultIsFavorite
                      ? t("removeFavoriteAria")
                      : t("addFavoriteAria")
                  }
                  className={`flex h-8 w-8 items-center justify-center rounded-full border outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                    resultIsFavorite
                      ? "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-300"
                      : "border-white/15 text-zinc-300 hover:border-white/35 hover:text-white"
                  }`}
                >
                  <HeartIcon filled={resultIsFavorite} className="h-4 w-4" />
                </button>
                {/* Hidden alongside the disabled Download button and the
                    zoom overlay when the image URL is dead — never offer a
                    link that is known to be broken. */}
                {!previewImageFailed && (
                  <a
                    href={resultImage.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/35 hover:text-white"
                  >
                    {t("openImage")}
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading || previewImageFailed}
                  className="rounded-full border border-violet-400/40 bg-violet-500/15 px-4 py-1.5 text-xs font-medium text-violet-200 transition enabled:hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {downloading ? t("downloading") : t("download")}
                </button>
              </div>
            )}
            {downloadNotice && (
              <p
                role="status"
                className={`mt-2 max-w-[18rem] text-center text-xs ${
                  downloadNotice.tone === "success"
                    ? "text-emerald-300"
                    : "text-amber-300"
                }`}
              >
                {downloadNotice.message}
              </p>
            )}
            {favoriteNotice && (
              <p
                role="status"
                className="mt-2 max-w-[18rem] text-center text-xs text-amber-300"
              >
                {favoriteNotice}
              </p>
            )}
            {(metaStyleLabel || metaDeviceLabel) && (
              <p className="mt-1 text-center text-xs font-medium text-violet-300">
                {metaStyleLabel ? `${metaStyleLabel} · ` : ""}
                {metaDeviceLabel}
                {resultSizeLabel ? ` · ${resultSizeLabel}` : ""}
              </p>
            )}
          </div>
        </div>

        {/* My Library — favorites and generation history. Both live on this
            device only and are stored / cleared independently of each other. */}
        <div className="mt-14 border-t border-white/5 pt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-sm font-medium text-zinc-300">{t("libraryTitle")}</h3>
            <div
              role="tablist"
              aria-label={t("libraryTabsAria")}
              className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/40 p-1"
            >
              {LIBRARY_TABS.map((tab) => {
                const active = libraryTab === tab.id;
                const count =
                  tab.id === "favorites" ? favorites.length : history.length;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setLibraryTab(tab.id)}
                    className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition ${
                      active
                        ? "bg-violet-500/25 text-white ring-1 ring-violet-400/50"
                        : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                    }`}
                  >
                    {t(tab.id === "favorites" ? "tabFavorites" : "tabHistory")}
                    <span className="text-[11px] text-zinc-500">{count}</span>
                  </button>
                );
              })}
            </div>
            {libraryTab === "history" && history.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-500 transition hover:border-red-400/40 hover:text-red-200"
              >
                {t("clearHistory")}
              </button>
            )}
          </div>

          {libraryNotice && (
            <p
              role="status"
              className={`mb-3 text-xs font-medium ${
                libraryNotice.tone === "success"
                  ? "text-emerald-300"
                  : "text-amber-300"
              }`}
            >
              {libraryNotice.message}
            </p>
          )}

          {libraryTab === "favorites" ? (
            favorites.length === 0 ? (
              <p className="text-xs text-zinc-600">
                {t("favoritesEmpty")}
              </p>
            ) : (
              <ul className="flex gap-3 overflow-x-auto pb-2">
                {favorites.map((entry) => {
                  const style = entry.styleId
                    ? findStyle(entry.styleId)
                    : undefined;
                  const deviceLabel = entry.device
                    ? tDevices(entry.device)
                    : undefined;
                  return (
                    <li key={entry.id} className="w-44 shrink-0">
                      {/* Non-interactive card: download and unfavorite are
                          independent buttons — no nesting, no accidental
                          clicks, failed downloads keep the record. */}
                      <div
                        title={entry.title}
                        className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/40"
                      >
                        <span className="relative block h-24 w-full">
                          <WallpaperImage
                            src={entry.imageUrl}
                            alt={
                              entry.title
                                ? t("entryFavoriteAlt", {
                                    title: entry.title.slice(0, 60),
                                  })
                                : t("entryFavoriteAltPlain")
                            }
                            gradient={
                              style?.gradient ??
                              "from-violet-600 via-purple-950 to-black"
                            }
                            className="h-full w-full object-cover"
                            onError={() => markThumbImageFailed(entry.id)}
                          />
                          {failedThumbIds.has(entry.id) && (
                            <span className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-[10px] font-medium text-amber-200">
                              {t("imageUnavailable")}
                            </span>
                          )}
                        </span>
                        <DownloadIconButton
                          busy={downloadingIds.has(entry.id)}
                          label={t("downloadEntryAria", {
                            title: entry.title || tCommon("thisWallpaper"),
                          })}
                          className="absolute left-2 top-2 h-7 w-7"
                          iconClassName="h-3.5 w-3.5"
                          onDownload={() => handleDownloadFavorite(entry)}
                        />
                        <button
                          type="button"
                          onClick={() => removeFavorite(entry.id)}
                          aria-label={t("removeEntryFavoriteAria", {
                            title: entry.title || tCommon("thisWallpaper"),
                          })}
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-fuchsia-400/60 bg-black/60 text-fuchsia-300 outline-none backdrop-blur transition hover:border-fuchsia-300 hover:text-fuchsia-200 focus-visible:ring-2 focus-visible:ring-violet-400/60"
                        >
                          <HeartIcon filled className="h-3.5 w-3.5" />
                        </button>
                        <div className="space-y-0.5 px-3 py-2">
                          <p className="truncate text-xs text-zinc-200">
                            {entry.title || t("untitled")}
                          </p>
                          <p className="truncate text-[11px] text-zinc-500">
                            {style ? tStyles(style.id) : t("noStyle")}
                            {deviceLabel ? ` · ${deviceLabel}` : ""} ·{" "}
                            {entry.source === "gallery"
                              ? t("sourceGallery")
                              : t("sourceGenerated")}
                            {entry.width != null && entry.height != null
                              ? ` · ${entry.width}×${entry.height}`
                              : ""}
                          </p>
                          <p className="text-[11px] text-zinc-600">
                            {formatHistoryTime(entry.createdAt)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : history.length === 0 ? (
            <p className="text-xs text-zinc-600">
              {t("historyEmpty")}
            </p>
          ) : (
            <ul className="flex gap-3 overflow-x-auto pb-2">
              {history.map((entry) => {
                const style = entry.styleId
                  ? findStyle(entry.styleId)
                  : undefined;
                const imageFailed = failedThumbIds.has(entry.id);
                return (
                  <li key={entry.id} className="w-44 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRestoreHistory(entry)}
                      title={entry.prompt}
                      aria-label={
                        entry.prompt
                          ? t("reuseAria", { prompt: entry.prompt.slice(0, 60) })
                          : t("reuseAriaPlain")
                      }
                      className="w-full overflow-hidden rounded-xl border border-white/10 bg-black/40 text-left transition hover:border-violet-400/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="relative block h-24 w-full">
                        <WallpaperImage
                          src={entry.imageUrl}
                          alt={
                            entry.prompt
                              ? t("historyThumbAlt", {
                                  prompt: entry.prompt.slice(0, 60),
                                })
                              : t("historyThumbAltPlain")
                          }
                          gradient={
                            style?.gradient ??
                            "from-violet-600 via-purple-950 to-black"
                          }
                          className="h-full w-full object-cover"
                          onError={() => markThumbImageFailed(entry.id)}
                        />
                        {/* Visible affordance: the whole card restores this
                            entry's settings into the editor. */}
                        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-violet-200 backdrop-blur">
                          {t("reuse")}
                        </span>
                        {imageFailed && (
                          <span className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-[10px] font-medium text-amber-200">
                            {t("imageUnavailable")}
                          </span>
                        )}
                      </span>
                      <span className="block space-y-0.5 px-3 py-2">
                        <span className="block truncate text-xs text-zinc-200">
                          {entry.prompt || t("noPrompt")}
                        </span>
                        <span className="block truncate text-[11px] text-zinc-500">
                          {style ? tStyles(style.id) : t("noStyle")} ·{" "}
                          {tDevices(entry.device)}
                          {entry.width != null && entry.height != null
                            ? ` · ${entry.width}×${entry.height}`
                            : ""}
                        </span>
                        <span className="block text-[11px] text-zinc-600">
                          {formatHistoryTime(entry.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {lightboxOpen && resultImage && (
        <Lightbox
          src={resultImage.url}
          alt={t("fullSizeAlt")}
          gradient={previewGradient}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </section>
  );
}
