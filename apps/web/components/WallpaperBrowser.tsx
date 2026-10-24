"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  PRESET_WALLPAPERS,
  isDownloadAllowed,
  styleCategoryOf,
  type PresetWallpaper,
} from "@/lib/wallpapers";
import {
  WALLPAPER_STYLES,
  STYLE_GROUPS,
  type StyleCategory,
  type StyleId,
  type WallStyle,
} from "@/lib/styles";
import {
  favoriteKeyOf,
  getFavoritesSnapshot,
  getServerFavoritesSnapshot,
  subscribeFavorites,
  toggleFavorite,
} from "@/lib/favorites";
import {
  downloadImage,
  markDownloading,
  markDownloadFinished,
  timestampedBaseName,
} from "@/lib/download";
import Input from "./ui/Input";
import Select from "./ui/Select";
import Button from "./ui/Button";
import EmptyState from "./ui/EmptyState";
import ToastStack, { type ToastItem } from "./ui/Toast";
import Pagination from "./ui/Pagination";
import ImageCard from "./ui/ImageCard";
import { SearchIcon } from "./icons";
import {
  DEVICE_ORDER,
  formatAspectRatio,
  sortMediaForPreferredDevice,
  type DeviceCategory,
} from "@/lib/media";
import { detectDeviceProfile, readScreenInfo } from "@/lib/studio/device";

/* ---- Filter model ----
   One classification system, derived entirely from lib/styles.ts: the
   STYLE_GROUPS categories (only those with presets are shown), with an
   optional style refinement inside the selected category. Nothing here is
   hardcoded against the style data. */

type CategoryFilter = StyleCategory | "all";
type SortId = "default" | "name";

/** Cards revealed per "Load more" step. */
const PAGE_SIZE = 60;

/** Categories that actually contain presets, in STYLE_GROUPS order. */
const CATEGORY_IDS: readonly CategoryFilter[] = [
  "all",
  ...STYLE_GROUPS.map((group) => group.id as CategoryFilter).filter((id) =>
    PRESET_WALLPAPERS.some(
      (wallpaper) => styleCategoryOf(wallpaper.styleId) === id
    )
  ),
];

/** Styles with presets inside one category, in declaration order. */
function styleOptionsForCategory(category: StyleCategory): WallStyle[] {
  return WALLPAPER_STYLES.filter(
    (style) =>
      style.category === category &&
      PRESET_WALLPAPERS.some((wallpaper) => wallpaper.styleId === style.id)
  );
}

let nextToastId = 0;
const pushToast = (
  list: readonly ToastItem[],
  message: string,
  tone: ToastItem["tone"]
): ToastItem[] => [...list, { id: ++nextToastId, message, tone }];

/**
 * The full wallpaper browser behind /wallpapers: client-side search,
 * category → style filtering, honest sort options, favorites and downloads
 — all over the static preset list, no backend and no AI calls.
 */
export default function WallpaperBrowser({
  deviceFilter,
  onDeviceReset,
}: {
  deviceFilter: "all" | DeviceCategory;
  onDeviceReset?: () => void;
}) {
  const t = useTranslations("gallery");
  const tUi = useTranslations("ui");
  const tPagination = useTranslations("pagination");
  const tCommon = useTranslations("common");
  const tWallpapers = useTranslations("galleryWallpapers");
  const tStyles = useTranslations("styleLabels");
  const tGroups = useTranslations("groupLabels");
  const tDevices = useTranslations("devices");

  // Two-tier filter: category first, optional style refinement inside it.
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [activeStyle, setActiveStyle] = useState<StyleId | null>(null);
  const [preferredDevice, setPreferredDevice] = useState<DeviceCategory | null>(null);
  // Use the same viewport classification as the Studio; this only changes
  // ordering when "All devices" is selected, never hides other work.
  useEffect(() => {
    const info = readScreenInfo();
    const profile = info ? detectDeviceProfile(info) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser facts after hydration
    setPreferredDevice(profile?.device ?? null);
  }, []);
  // Local search across title, style name and description. Purely client
  // side over the static preset list — no backend, no AI.
  const [query, setQuery] = useState("");
  // Presets carry no reliable creation-time field, so only the data order
  // and the alphabetical order are offered — no fake "newest" sort.
  const [sort, setSort] = useState<SortId>("default");
  // Load-more pagination over the filtered list.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Favorites live in localStorage (an external system) and are shared with
  // the generator's My Library panel through the same store, so every heart
  // stays in sync. SSR/hydration render the empty snapshot first.
  const favorites = useSyncExternalStore(
    subscribeFavorites,
    getFavoritesSnapshot,
    getServerFavoritesSnapshot
  );
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  // Per-card download-in-flight tracking: one card downloading never
  // disables the others.
  const [downloadingIds, setDownloadingIds] = useState<ReadonlySet<string>>(
    new Set()
  );

  const favoriteKeys = new Set(favorites.map((favorite) => favorite.key));

  const dismissToast = (id: number) =>
    setToasts((current) => current.filter((toast) => toast.id !== id));

  const localizedTitle = (wallpaper: PresetWallpaper) =>
    tWallpapers(`${wallpaper.id}.title`);
  const localizedAlt = (wallpaper: PresetWallpaper) =>
    tWallpapers(`${wallpaper.id}.alt`);

  const activeStyleOptions = useMemo(
    () =>
      activeCategory === "all"
        ? []
        : styleOptionsForCategory(activeCategory),
    [activeCategory]
  );

  const visibleWallpapers = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    let list = PRESET_WALLPAPERS.filter((wallpaper) => {
      if (
        activeCategory !== "all" &&
        styleCategoryOf(wallpaper.styleId) !== activeCategory
      ) {
        return false;
      }
      if (activeStyle && wallpaper.styleId !== activeStyle) {
        return false;
      }
      if (
        deviceFilter !== "all" &&
        !wallpaper.nativeDevices.includes(deviceFilter)
      ) {
        return false;
      }
      if (trimmed) {
        const haystack = [
          localizedTitle(wallpaper),
          localizedAlt(wallpaper),
          tStyles(wallpaper.styleId),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(trimmed)) return false;
      }
      return true;
    });
    if (sort === "name") {
      list = [...list].sort((a, b) =>
        localizedTitle(a).localeCompare(localizedTitle(b))
      );
    } else if (deviceFilter === "all" && preferredDevice) {
      list = sortMediaForPreferredDevice(list, preferredDevice);
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- localized* close over stable translation functions
  }, [activeCategory, activeStyle, query, sort, deviceFilter, preferredDevice, tWallpapers, tStyles]);

  const shownWallpapers = visibleWallpapers.slice(0, visibleCount);
  // Device sections use the file's primary native class. Groups are ordered so
  // the current screen's format appears first, but every device stays visible.
  const deviceOrder = preferredDevice
    ? [preferredDevice, ...DEVICE_ORDER.filter((id) => id !== preferredDevice)]
    : [...DEVICE_ORDER];
  const deviceGroups = deviceOrder
    .map((device) => ({
      device,
      items: shownWallpapers.filter(
        (wallpaper) => wallpaper.nativeDevices[0] === device
      ),
    }))
    .filter((group) => group.items.length > 0);
  const gridClass: Record<DeviceCategory, string> = {
    phone: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
    tablet: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
    desktop: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  };
  const hasActiveFilters =
    activeCategory !== "all" ||
    activeStyle !== null ||
    deviceFilter !== "all" ||
    query.trim() !== "";

  const resetFilters = () => {
    setActiveCategory("all");
    setActiveStyle(null);
    setQuery("");
    setVisibleCount(PAGE_SIZE);
    onDeviceReset?.();
  };

  const handleCategorySelect = (next: CategoryFilter) => {
    // Switching category resets the style refinement — the old sub-filter
    // may not exist in the new category.
    setActiveCategory(next);
    setActiveStyle(null);
    setVisibleCount(PAGE_SIZE);
  };

  // Saves or unsaves a preset wallpaper. Only touches the favorites store —
  // never the generator state and never an AI request.
  const handleToggleGalleryFavorite = (wallpaper: PresetWallpaper) => {
    const outcome = toggleFavorite({
      key: favoriteKeyOf("gallery", wallpaper.id, wallpaper.image ?? ""),
      source: "gallery",
      sourceId: wallpaper.id,
      title: localizedTitle(wallpaper),
      imageUrl: wallpaper.image ?? "",
      styleId: wallpaper.styleId,
      device: null,
    });
    if (outcome === "limit-reached") {
      setToasts((current) =>
        pushToast(current, tCommon("favoriteLimit"), "warning")
      );
    } else if (outcome === "unavailable") {
      setToasts((current) =>
        pushToast(current, tCommon("favoritesUnavailable"), "warning")
      );
    }
  };

  // Downloads the preset artwork through the shared helper — never triggers
  // the generator, favorites or navigation. The file name uses the preset's
  // internal id (URL-safe, stable), never the remote URL or its query string.
  const handleDownloadGalleryWallpaper = async (wallpaper: PresetWallpaper) => {
    if (!wallpaper.image || downloadingIds.has(wallpaper.id)) return;
    setDownloadingIds((current) => markDownloading(current, wallpaper.id));
    try {
      const outcome = await downloadImage({
        url: wallpaper.image,
        baseName: timestampedBaseName(`wallhaze-${wallpaper.id}`),
      });
      if (outcome === "downloaded") {
        setToasts((current) =>
          pushToast(
            current,
            t("downloadSaved", { title: localizedTitle(wallpaper) }),
            "success"
          )
        );
      } else if (outcome === "opened") {
        setToasts((current) =>
          pushToast(current, tCommon("downloadOpened"), "warning")
        );
      } else {
        setToasts((current) =>
          pushToast(current, tCommon("downloadFailed"), "error")
        );
      }
    } catch {
      // Defensive: downloadImage is designed not to reject, but any surprise
      // failure must not surface as an unhandled promise rejection.
      setToasts((current) =>
        pushToast(current, tCommon("downloadFailed"), "error")
      );
    } finally {
      setDownloadingIds((current) =>
        markDownloadFinished(current, wallpaper.id)
      );
    }
  };

  return (
    <div>
      {/* Search + sort */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Input
          type="text"
          aria-label={t("searchAria")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          placeholder={t("searchPlaceholder")}
          className="w-full md:max-w-xs"
          trailing={
            query !== "" ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("clearSearchAria")}
                className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 outline-none transition hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-400/60"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  className="h-3.5 w-3.5"
                  aria-hidden
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            ) : null
          }
        />
        <div className="flex shrink-0 items-center gap-2">
          <label
            htmlFor="wallpaper-sort"
            className="text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            {t("sortLabel")}
          </label>
          <Select
            id="wallpaper-sort"
            aria-label={t("sortAria")}
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortId);
              setVisibleCount(PAGE_SIZE);
            }}
            options={[
              { value: "default", label: t("sortDefault") },
              { value: "name", label: t("sortName") },
            ]}
            className="w-40"
          />
        </div>
      </div>

      {/* Category filter — derived from STYLE_GROUPS, only non-empty ones */}
      <div
        role="group"
        aria-label={t("categoryGroupAria")}
        className="mb-4 flex flex-wrap gap-2"
      >
        {CATEGORY_IDS.map((id) => {
          const active = activeCategory === id;
          const count =
            id === "all"
              ? PRESET_WALLPAPERS.length
              : PRESET_WALLPAPERS.filter(
                  (wallpaper) => styleCategoryOf(wallpaper.styleId) === id
                ).length;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => handleCategorySelect(id)}
              className={`rounded-full border px-4 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                active
                  ? "border-violet-400/70 bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.35)]"
                  : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
              }`}
            >
              {id === "all" ? t("allCategory") : tGroups(id)}
              <span className="ml-1.5 text-xs text-zinc-500">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Style refinement inside the selected category */}
      {activeStyleOptions.length > 0 && (
        <div
          role="group"
          aria-label={t("styleGroupAria", {
            category: tGroups(activeCategory),
          })}
          className="mb-8 flex flex-wrap gap-2 md:mb-10"
        >
          <button
            type="button"
            aria-pressed={activeStyle === null}
            onClick={() => {
              setActiveStyle(null);
              setVisibleCount(PAGE_SIZE);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
              activeStyle === null
                ? "border-violet-400/70 bg-violet-500/20 text-white"
                : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
            }`}
          >
            {t("allStyles")}
          </button>
          {activeStyleOptions.map((style) => {
            const active = activeStyle === style.id;
            return (
              <button
                key={style.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setActiveStyle(style.id);
                  setVisibleCount(PAGE_SIZE);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                  active
                    ? "border-violet-400/70 bg-violet-500/20 text-white"
                    : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                }`}
              >
                {tStyles(style.id)}
              </button>
            );
          })}
        </div>
      )}
      {!activeStyleOptions.length && <div className="mb-8 md:mb-10" />}

      <ToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        dismissLabel={tUi("dismiss")}
        className="mb-6"
      />

      {visibleWallpapers.length === 0 ? (
        <EmptyState
          title={deviceFilter === "all" ? t("emptyTitle") : t("noDeviceTitle")}
          body={deviceFilter === "all" ? t("emptyBody") : t("noDeviceBody")}
          icon={<SearchIcon className="h-5 w-5" />}
          action={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                {t("clearFilters")}
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="space-y-10">
            {deviceGroups.map((group, groupIndex) => (
              <section key={group.device} aria-labelledby={`device-${group.device}`}>
                <div className="mb-3 flex items-baseline gap-2">
                  <h3
                    id={`device-${group.device}`}
                    className="text-sm font-semibold text-zinc-200"
                  >
                    {tDevices(group.device)}
                  </h3>
                  <span className="text-xs text-zinc-500">
                    {group.items.length}
                  </span>
                </div>
                <div
                  className={`grid items-start gap-4 md:gap-5 ${gridClass[group.device]}`}
                >
                  {group.items.map((wallpaper, index) => {
                    const favorited = favoriteKeys.has(
                      favoriteKeyOf(
                        "gallery",
                        wallpaper.id,
                        wallpaper.image ?? ""
                      )
                    );
                    return (
                      <ImageCard
                        key={wallpaper.id}
                        href={`/wallpapers/${wallpaper.id}`}
                        image={wallpaper.image ?? undefined}
                        gradient={wallpaper.gradient}
                        reviewLabel={t("reviewOnly")}
                        alt={localizedAlt(wallpaper)}
                        title={localizedTitle(wallpaper)}
                        styleLabel={tStyles(wallpaper.styleId)}
                        viewLabel={t("cardViewAria", {
                          title: localizedTitle(wallpaper),
                        })}
                        downloadLabel={t("cardDownloadAria", {
                          title: localizedTitle(wallpaper),
                        })}
                        downloading={downloadingIds.has(wallpaper.id)}
                        onDownload={
                          isDownloadAllowed(wallpaper.license)
                            ? () => handleDownloadGalleryWallpaper(wallpaper)
                            : undefined
                        }
                        favoriteLabel={t("cardFavoriteAria", {
                          title: localizedTitle(wallpaper),
                        })}
                        unfavoriteLabel={t("cardUnfavoriteAria", {
                          title: localizedTitle(wallpaper),
                        })}
                        favorited={favorited}
                        onToggleFavorite={
                          wallpaper.canPubliclyDisplay
                            ? () => handleToggleGalleryFavorite(wallpaper)
                            : undefined
                        }
                        priority={groupIndex === 0 && index < 4}
                        aspectRatio={wallpaper.aspectRatio}
                        devices={wallpaper.nativeDevices}
                        ratioLabel={formatAspectRatio(
                          wallpaper.width,
                          wallpaper.height
                        )}
                        width={wallpaper.width}
                        height={wallpaper.height}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <Pagination
            shown={shownWallpapers.length}
            total={visibleWallpapers.length}
            labels={{
              loadMore: tPagination("loadMore"),
              showing: tPagination("showing"),
              end: tPagination("end"),
            }}
            onLoadMore={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="mt-10"
          />
        </>
      )}
    </div>
  );
}
