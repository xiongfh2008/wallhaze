import { WALLPAPER_STYLES, type StyleId } from "./styles";
import {
  isAspectRatioId,
  isSizePresetId,
  type AspectRatioId,
  type HistoryDevice,
} from "./sizes";

/**
 * Local favorites ("My Library") for gallery wallpapers and generated
 * results.
 *
 * Storage contract (mirrors lib/history.ts):
 * - Device-local only (localStorage), no accounts, no cloud sync.
 * - Only metadata + image URL are stored; never reference image data
 *   (base64) and never image bytes.
 * - Favorites use their own storage key and are cleared independently of
 *   generation history — the two lists never affect each other.
 * - All storage access is environment-guarded and try/caught: private
 *   browsing, disabled storage, quota errors and corrupted JSON must never
 *   crash the site.
 */

export type FavoriteSource = "gallery" | "generated";

/** One saved wallpaper, newest first when listed. */
export interface FavoriteEntry {
  /** Unique record ID (crypto.randomUUID with a fallback generator). */
  id: string;
  /**
   * Deduplication key: `gallery:<preset id>` or `generated:<image url>`.
   * The same wallpaper can only exist once, no matter where it was saved.
   */
  key: string;
  source: FavoriteSource;
  /** Gallery preset id when source is "gallery", otherwise null. */
  sourceId: string | null;
  /** Gallery title, or the prompt behind a generated wallpaper. */
  title: string;
  /** Image URL — never a data: URI / base64 payload. */
  imageUrl: string;
  styleId: StyleId | null;
  /** Device of a generated wallpaper; gallery entries have none. */
  device: HistoryDevice | null;
  /**
   * Aspect ratio of a generated wallpaper ("9:16" | "3:4" | "1:1" | "4:3" |
   * "16:9"); gallery presets have none. Optional for entries saved before
   * ratios existed; an invalid stored value is dropped on load instead of
   * rejecting the whole record.
   */
  ratio?: AspectRatioId | null;
  /**
   * Resolution preset of a generated wallpaper (lib/sizes.ts id), or null
   * for gallery presets and model-default generations. Optional for entries
   * saved before presets existed; an unknown stored id is dropped on load
   * instead of rejecting the whole record.
   */
  sizePresetId?: string | null;
  width: number | null;
  height: number | null;
  /** Creation time as epoch milliseconds. */
  createdAt: number;
}

/** Everything the caller knows at save time. */
export interface FavoriteInput {
  key: string;
  source: FavoriteSource;
  sourceId: string | null;
  title: string;
  imageUrl: string;
  styleId: StyleId | null;
  device: HistoryDevice | null;
  ratio?: AspectRatioId | null;
  sizePresetId?: string | null;
  width?: number | null;
  height?: number | null;
}

export type FavoriteToggleResult =
  | "added"
  | "removed"
  | "limit-reached"
  | "unavailable";

const STORAGE_KEY = "wallhaze:favorites:v1";
const MAX_FAVORITES = 100;

const SOURCES: readonly FavoriteSource[] = ["gallery", "generated"];
const DEVICES: readonly HistoryDevice[] = ["phone", "tablet", "desktop"];

const STYLE_IDS: ReadonlySet<string> = new Set(
  WALLPAPER_STYLES.map((style) => style.id)
);

/** Stable dedup key for a wallpaper from either source. */
export function favoriteKeyOf(
  source: FavoriteSource,
  sourceId: string | null,
  imageUrl: string
): string {
  return source === "gallery" && sourceId
    ? `gallery:${sourceId}`
    : `generated:${imageUrl}`;
}

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
function isFavoriteEntry(value: unknown): value is FavoriteEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;

  if (typeof entry.id !== "string" || entry.id.length === 0) return false;
  if (typeof entry.key !== "string" || entry.key.length === 0) return false;
  if (!SOURCES.includes(entry.source as FavoriteSource)) return false;
  if (entry.sourceId !== null && typeof entry.sourceId !== "string") {
    return false;
  }
  if (typeof entry.title !== "string") return false;
  if (
    typeof entry.imageUrl !== "string" ||
    !entry.imageUrl.startsWith("https://")
  ) {
    return false;
  }

  // Unknown style ids (removed/renamed styles) degrade to null instead of
  // rejecting the whole record, mirroring lib/history.ts.
  const styleId = entry.styleId;
  if (
    styleId !== null &&
    !(typeof styleId === "string" && STYLE_IDS.has(styleId))
  ) {
    entry.styleId = null;
  }

  const device = entry.device;
  if (device !== null && !DEVICES.includes(device as HistoryDevice)) {
    return false;
  }

  if (!isFiniteNumber(entry.createdAt) || entry.createdAt <= 0) return false;

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

  return true;
}

/**
 * Drops an invalid optional ratio instead of rejecting the whole record,
 * mirroring lib/history.ts: legacy entries have no ratio, and a corrupted
 * value must not take a valid favorite down with it.
 */
function normalizeFavoriteEntry(entry: FavoriteEntry): FavoriteEntry {
  const ratio =
    entry.ratio == null || isAspectRatioId(entry.ratio)
      ? entry.ratio ?? null
      : null;
  // Unknown preset ids degrade to the model default, mirroring lib/history.ts.
  const sizePresetId =
    entry.sizePresetId == null || isSizePresetId(entry.sizePresetId)
      ? entry.sizePresetId ?? null
      : null;
  if (ratio === entry.ratio && sizePresetId === entry.sizePresetId) {
    return entry;
  }
  return { ...entry, ratio, sizePresetId };
}

function readEntries(storage: Storage): FavoriteEntry[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isFavoriteEntry)
      .map(normalizeFavoriteEntry)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_FAVORITES);
  } catch {
    // Corrupted JSON or unreadable entry — treat as empty (self-healing).
    return [];
  }
}

function writeEntries(storage: Storage, entries: FavoriteEntry[]): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the favorites, newest first. Returns an empty array on the server,
 * when storage is unavailable, or when stored data is corrupted.
 */
export function loadFavorites(): FavoriteEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  return readEntries(storage);
}

/* ---- Shared store (external system: localStorage) ----
   Subscribed to by the gallery, the generator preview and the My Library
   panel, so every heart stays in sync through one cached snapshot. */

const EMPTY_FAVORITES: FavoriteEntry[] = [];
let favoritesCache: FavoriteEntry[] | null = null;
const favoritesListeners = new Set<() => void>();

export function subscribeFavorites(callback: () => void): () => void {
  favoritesListeners.add(callback);
  return () => {
    favoritesListeners.delete(callback);
  };
}

// Cached so useSyncExternalStore sees a stable reference between renders.
export function getFavoritesSnapshot(): FavoriteEntry[] {
  if (favoritesCache === null) {
    favoritesCache = loadFavorites();
  }
  return favoritesCache;
}

export function getServerFavoritesSnapshot(): FavoriteEntry[] {
  return EMPTY_FAVORITES;
}

function notifyFavoritesChanged(): void {
  favoritesCache = null;
  favoritesListeners.forEach((listener) => listener());
}

/**
 * Adds the wallpaper to favorites — or removes it when the same wallpaper
 * (matching dedup key) is already saved. Returns what happened so callers
 * can give clear feedback; never throws.
 */
export function toggleFavorite(input: FavoriteInput): FavoriteToggleResult {
  const storage = getStorage();
  if (!storage) return "unavailable";
  // Enforce the no-base64 contract at the data layer as well.
  if (!input.imageUrl.startsWith("https://")) return "unavailable";

  const current = readEntries(storage);
  const existingIndex = current.findIndex(
    (entry) => entry.key === input.key
  );
  if (existingIndex >= 0) {
    const next = current.filter((_, index) => index !== existingIndex);
    if (!writeEntries(storage, next)) return "unavailable";
    notifyFavoritesChanged();
    return "removed";
  }

  if (current.length >= MAX_FAVORITES) return "limit-reached";

  const entry: FavoriteEntry = {
    id: createId(),
    key: input.key,
    source: input.source,
    sourceId: input.sourceId,
    title: input.title,
    imageUrl: input.imageUrl,
    styleId: input.styleId,
    device: input.device,
    ratio: input.ratio ?? null,
    sizePresetId: input.sizePresetId ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    createdAt: Date.now(),
  };
  if (!writeEntries(storage, [entry, ...current])) return "unavailable";
  notifyFavoritesChanged();
  return "added";
}

/**
 * Removes one favorite by record ID. Returns true when something was
 * removed. Favorites are never removed anywhere else.
 */
export function removeFavorite(id: string): boolean {
  const storage = getStorage();
  if (!storage) return false;
  const current = readEntries(storage);
  const next = current.filter((entry) => entry.id !== id);
  if (next.length === current.length) return false;
  if (!writeEntries(storage, next)) return false;
  notifyFavoritesChanged();
  return true;
}
