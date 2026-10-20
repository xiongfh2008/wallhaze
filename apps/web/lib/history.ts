import { WALLPAPER_STYLES, type StyleId } from "./styles";
import {
  isAspectRatioId,
  isSizePresetId,
  type AspectRatioId,
  type HistoryDevice,
} from "./sizes";

// The canonical device type lives in lib/sizes.ts (shared with the
// generation API); re-exported here for existing import sites.
export type { HistoryDevice };

/**
 * Local generation history for the generator UI.
 *
 * Storage contract:
 * - Device-local only (localStorage), no accounts, no cloud sync.
 * - Only metadata + image URL are stored; never reference image data
 *   (base64) and never image bytes.
 * - All storage access is environment-guarded and try/caught: private
 *   browsing, disabled storage, quota errors and corrupted JSON must never
 *   crash the site.
 */

/** One successfully generated wallpaper, newest first when listed. */
export interface GenerationHistoryEntry {
  /** Unique record ID (crypto.randomUUID with a fallback generator). */
  id: string;
  /** Creation time as epoch milliseconds. */
  createdAt: number;
  /** The prompt the user submitted (trimmed). */
  prompt: string;
  /** Selected style, or null when generated without a style preset. */
  styleId: StyleId | null;
  device: HistoryDevice;
  /**
   * Aspect ratio used for the generation ("9:16" | "3:4" | "1:1" | "4:3" |
   * "16:9"). Optional: entries saved before ratios existed have none, and
   * an invalid stored value is dropped on load instead of rejecting the
   * whole record.
   */
  ratio?: AspectRatioId | null;
  /**
   * Resolution preset used for the generation (lib/sizes.ts id), or null
   * when the model-default enum size was used. Optional for entries saved
   * before presets existed; an unknown stored id is dropped on load instead
   * of rejecting the whole record.
   */
  sizePresetId?: string | null;
  /** Generated image URL — never a data: URI / base64 payload. */
  imageUrl: string;
  width: number | null;
  height: number | null;
  /** Whether a reference image was used; the image itself is NOT stored. */
  hasReferenceImage: boolean;
}

/** Everything the caller knows right after a successful generation. */
export interface GenerationHistoryInput {
  prompt: string;
  styleId: StyleId | null;
  device: HistoryDevice;
  ratio?: AspectRatioId | null;
  sizePresetId?: string | null;
  imageUrl: string;
  width?: number | null;
  height?: number | null;
  hasReferenceImage: boolean;
}

const STORAGE_KEY = "wallhaze:history:v1";
const MAX_ENTRIES = 20;

const DEVICES: readonly HistoryDevice[] = ["phone", "tablet", "desktop"];

const STYLE_IDS: ReadonlySet<string> = new Set(
  WALLPAPER_STYLES.map((style) => style.id)
);

/**
 * Returns the localStorage instance when usable, or null on the server,
 * in private mode, or when storage throws. A tiny probe write detects
 * browsers where localStorage exists but is blocked.
 */
function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    const probe = "__wallhaze_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts / older browsers.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Structural validation — never trust arbitrary JSON from localStorage. */
function isHistoryEntry(value: unknown): value is GenerationHistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;

  if (typeof entry.id !== "string" || entry.id.length === 0) return false;
  if (!isFiniteNumber(entry.createdAt) || entry.createdAt <= 0) return false;
  if (typeof entry.prompt !== "string") return false;

  // Unknown style ids (removed/renamed styles) degrade to null instead of
  // rejecting the whole record — the prompt, image and size metadata stay
  // intact, mirroring how ratio/preset ids are normalized below.
  const styleId = entry.styleId;
  if (styleId !== null && !(typeof styleId === "string" && STYLE_IDS.has(styleId))) {
    entry.styleId = null;
  }

  if (!DEVICES.includes(entry.device as HistoryDevice)) return false;
  if (typeof entry.imageUrl !== "string" || !entry.imageUrl.startsWith("https://")) {
    return false;
  }

  const { width, height } = entry;
  if (width !== null && !isFiniteNumber(width)) return false;
  if (height !== null && !isFiniteNumber(height)) return false;

  // Optional preset id: absent (legacy) or null is fine; a non-string value
  // is dropped by normalize below rather than rejecting the record.
  if (
    entry.sizePresetId !== undefined &&
    entry.sizePresetId !== null &&
    typeof entry.sizePresetId !== "string"
  ) {
    entry.sizePresetId = null;
  }

  return typeof entry.hasReferenceImage === "boolean";
}

/**
 * Drops an invalid optional ratio instead of rejecting the whole record:
 * entries saved before ratios existed have none, and a corrupted value
 * must not take valid history down with it.
 */
function normalizeHistoryEntry(
  entry: GenerationHistoryEntry
): GenerationHistoryEntry {
  const ratio =
    entry.ratio == null || isAspectRatioId(entry.ratio)
      ? entry.ratio ?? null
      : null;
  // Unknown preset ids (removed/renamed config) degrade to the model
  // default instead of taking the whole record down.
  const sizePresetId =
    entry.sizePresetId == null || isSizePresetId(entry.sizePresetId)
      ? entry.sizePresetId ?? null
      : null;
  if (ratio === entry.ratio && sizePresetId === entry.sizePresetId) {
    return entry;
  }
  return { ...entry, ratio, sizePresetId };
}

function readEntries(storage: Storage): GenerationHistoryEntry[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isHistoryEntry)
      .map(normalizeHistoryEntry)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_ENTRIES);
  } catch {
    // Corrupted JSON or unreadable entry — treat as empty (self-healing).
    return [];
  }
}

function writeEntries(storage: Storage, entries: GenerationHistoryEntry[]): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the history, newest first. Returns an empty array on the server,
 * when storage is unavailable, or when stored data is corrupted.
 */
export function loadGenerationHistory(): GenerationHistoryEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  return readEntries(storage);
}

/**
 * Adds one entry, keeps at most the latest {@link MAX_ENTRIES} records and
 * persists the list. Returns the created entry, or null when storage is
 * unavailable / the write fails (callers should not treat it as persisted).
 */
export function addGenerationHistory(
  input: GenerationHistoryInput
): GenerationHistoryEntry | null {
  const storage = getStorage();
  if (!storage) return null;

  const entry: GenerationHistoryEntry = {
    id: createId(),
    createdAt: Date.now(),
    prompt: input.prompt,
    styleId: input.styleId,
    device: input.device,
    ratio: input.ratio ?? null,
    sizePresetId: input.sizePresetId ?? null,
    imageUrl: input.imageUrl,
    width: input.width ?? null,
    height: input.height ?? null,
    hasReferenceImage: input.hasReferenceImage,
  };

  const next = [entry, ...readEntries(storage)].slice(0, MAX_ENTRIES);
  return writeEntries(storage, next) ? entry : null;
}

/** Clears the history. Safe to call anywhere; failures are ignored. */
export function clearGenerationHistory(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
