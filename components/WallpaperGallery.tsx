"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { PRESET_WALLPAPERS, type PresetWallpaper } from "@/lib/wallpapers";
import {
  STYLE_GROUPS,
  STYLE_SELECT_EVENT,
  WALLPAPER_STYLES,
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
import WallpaperImage from "./WallpaperImage";
import Lightbox from "./Lightbox";
import { HeartIcon } from "./icons";
import { DownloadIconButton } from "./DownloadIconButton";

/* ---- Icons ---- */

function ExpandIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

/* ---- Filter model ----
   One classification system, derived entirely from lib/styles.ts: the six
   STYLE_GROUPS categories (only those with presets are shown), with an
   optional style refinement inside the selected category. Nothing here is
   hardcoded against the style data. */

type CategoryFilter = StyleCategory | "all";
type SortId = "default" | "name";

const SORT_IDS: readonly SortId[] = ["default", "name"];

const STYLE_CATEGORY = new Map<StyleId, StyleCategory>(
  WALLPAPER_STYLES.flatMap((style) =>
    style.category ? [[style.id, style.category] as [StyleId, StyleCategory]] : []
  )
);

/** Categories that actually contain presets, in STYLE_GROUPS order. */
const CATEGORY_IDS: readonly CategoryFilter[] = [
  "all",
  ...STYLE_GROUPS.map((group) => group.id as CategoryFilter).filter((id) =>
    PRESET_WALLPAPERS.some(
      (wallpaper) => STYLE_CATEGORY.get(wallpaper.styleId) === id
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

export default function WallpaperGallery() {
  const t = useTranslations("gallery");
  const tCommon = useTranslations("common");
  const tWallpapers = useTranslations("galleryWallpapers");
  const tStyles = useTranslations("styleLabels");
  const tGroups = useTranslations("groupLabels");

  // Two-tier filter: category first, optional style refinement inside it.
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [activeStyle, setActiveStyle] = useState<StyleId | null>(null);
  // Local search across title, style name and description. Purely client
  // side over the static preset list — no backend, no AI.
  const [query, setQuery] = useState("");
  // Presets carry no reliable creation-time field, so only the data order
  // and the alphabetical order are offered — no fake "newest" sort.
  const [sort, setSort] = useState<SortId>("default");
  // Detail dialog: the preset id currently viewed full-size, or null.
  const [detailId, setDetailId] = useState<string | null>(null);
  // Favorites live in localStorage (an external system) and are shared with
  // the generator's My Library panel through the same store, so every heart
  // stays in sync. SSR/hydration render the empty snapshot first.
  const favorites = useSyncExternalStore(
    subscribeFavorites,
    getFavoritesSnapshot,
    getServerFavoritesSnapshot
  );
  const [galleryNotice, setGalleryNotice] = useState<{
    message: string;
    tone: "success" | "warning";
  } | null>(null);
  // Per-card download-in-flight tracking: one card downloading never
  // disables the others.
  const [downloadingIds, setDownloadingIds] = useState<ReadonlySet<string>>(
    new Set()
  );

  const favoriteKeys = new Set(favorites.map((favorite) => favorite.key));

  const detailWallpaper = detailId
    ? PRESET_WALLPAPERS.find((wallpaper) => wallpaper.id === detailId)
    : undefined;

  const activeStyleOptions = useMemo(
    () =>
      activeCategory === "all"
        ? []
        : styleOptionsForCategory(activeCategory),
    [activeCategory]
  );

  const localizedTitle = (wallpaper: PresetWallpaper) =>
    tWallpapers(`${wallpaper.id}.title`);
  const localizedAlt = (wallpaper: PresetWallpaper) =>
    tWallpapers(`${wallpaper.id}.alt`);

  const visibleWallpapers = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    let list = PRESET_WALLPAPERS.filter((wallpaper) => {
      if (
        activeCategory !== "all" &&
        STYLE_CATEGORY.get(wallpaper.styleId) !== activeCategory
      ) {
        return false;
      }
      if (activeStyle && wallpaper.styleId !== activeStyle) {
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
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- localized* close over stable translation functions
  }, [activeCategory, activeStyle, query, sort, tWallpapers, tStyles]);

  const hasActiveFilters =
    activeCategory !== "all" || activeStyle !== null || query.trim() !== "";

  const resetFilters = () => {
    setActiveCategory("all");
    setActiveStyle(null);
    setQuery("");
  };

  const handleCategorySelect = (next: CategoryFilter) => {
    // Switching category resets the style refinement — the old sub-filter
    // may not exist in the new category.
    setActiveCategory(next);
    setActiveStyle(null);
  };

  // Mirrors PopularStyles: preselect the style in the generator and scroll
  // to it. The generator owns its state — the gallery only dispatches.
  const handleCardClick = (styleId: StyleId) => {
    window.dispatchEvent(
      new CustomEvent(STYLE_SELECT_EVENT, { detail: styleId })
    );
    document.getElementById("generator")?.scrollIntoView({ behavior: "smooth" });
  };

  // From the detail dialog: same honest hand-off as the card click — only
  // the style id is passed (presets carry no original generation params),
  // the prompt stays empty and editable, and nothing is generated.
  const handleCreateSimilar = (wallpaper: PresetWallpaper) => {
    setDetailId(null);
    handleCardClick(wallpaper.styleId);
  };

  // Saves or unsaves a preset wallpaper. Only touches the favorites store —
  // never the generator state and never an AI request.
  const handleToggleGalleryFavorite = (wallpaper: PresetWallpaper) => {
    const outcome = toggleFavorite({
      key: favoriteKeyOf("gallery", wallpaper.id, wallpaper.image),
      source: "gallery",
      sourceId: wallpaper.id,
      title: localizedTitle(wallpaper),
      imageUrl: wallpaper.image,
      styleId: wallpaper.styleId,
      device: null,
    });
    if (outcome === "limit-reached") {
      setGalleryNotice({
        message: tCommon("favoriteLimit"),
        tone: "warning",
      });
    } else if (outcome === "unavailable") {
      setGalleryNotice({
        message: tCommon("favoritesUnavailable"),
        tone: "warning",
      });
    } else {
      setGalleryNotice(null);
    }
  };

  // Downloads the preset artwork through the shared helper — never triggers
  // the generator, favorites or navigation. The file name uses the preset's
  // internal id (URL-safe, stable), never the remote URL or its query string.
  const handleDownloadGalleryWallpaper = async (wallpaper: PresetWallpaper) => {
    if (downloadingIds.has(wallpaper.id)) return;
    setDownloadingIds((current) => markDownloading(current, wallpaper.id));
    setGalleryNotice(null);
    try {
      const outcome = await downloadImage({
        url: wallpaper.image,
        baseName: timestampedBaseName(`wallhaze-${wallpaper.id}`),
      });
      if (outcome === "downloaded") {
        setGalleryNotice({
          message: t("downloadSaved", { title: localizedTitle(wallpaper) }),
          tone: "success",
        });
      } else if (outcome === "opened") {
        setGalleryNotice({
          message: tCommon("downloadOpened"),
          tone: "warning",
        });
      } else {
        setGalleryNotice({
          message: tCommon("downloadFailed"),
          tone: "warning",
        });
      }
    } catch {
      // Defensive: downloadImage is designed not to reject, but any surprise
      // failure must not surface as an unhandled promise rejection.
      setGalleryNotice({
        message: tCommon("downloadFailed"),
        tone: "warning",
      });
    } finally {
      setDownloadingIds((current) =>
        markDownloadFinished(current, wallpaper.id)
      );
    }
  };

  return (
    <section id="explore" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 max-w-2xl md:mb-12">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
            {t("eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
            {t("title")}
          </h2>
          <p className="mt-4 leading-relaxed text-zinc-400">
            {t("subtitle")}
          </p>
        </div>

        {/* Search + sort */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              aria-label={t("searchAria")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full rounded-full border border-white/10 bg-black/40 py-2 pl-10 pr-9 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
            />
            {query !== "" && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("clearSearchAria")}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 outline-none transition hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-400/60"
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
            )}
          </div>
          <div
            role="group"
            aria-label={t("sortAria")}
            className="flex shrink-0 items-center gap-2"
          >
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {t("sortLabel")}
            </span>
            {SORT_IDS.map((id) => {
              const active = sort === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSort(id)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs transition ${
                    active
                      ? "border-violet-400/70 bg-violet-500/20 text-white"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                  }`}
                >
                  {id === "default" ? t("sortDefault") : t("sortName")}
                </button>
              );
            })}
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
                    (wallpaper) =>
                      STYLE_CATEGORY.get(wallpaper.styleId) === id
                  ).length;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => handleCategorySelect(id)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
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
              onClick={() => setActiveStyle(null)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
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
                  onClick={() => setActiveStyle(style.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
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

        {galleryNotice ? (
          <p
            role="status"
            className={`mb-6 text-sm ${
              galleryNotice.tone === "success"
                ? "text-emerald-300"
                : "text-amber-300"
            }`}
          >
            {galleryNotice.message}
          </p>
        ) : null}

        {visibleWallpapers.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-14 text-center">
            <p className="text-sm font-medium text-zinc-200">
              {t("emptyTitle")}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{t("emptyBody")}</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 rounded-full border border-violet-400/40 bg-violet-500/15 px-4 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/25"
              >
                {t("clearFilters")}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
            {visibleWallpapers.map((wallpaper) => {
              const favorited = favoriteKeys.has(
                favoriteKeyOf("gallery", wallpaper.id, wallpaper.image)
              );
              return (
                // Card container: the main button and the overlay controls are
                // siblings (never nested buttons), so saving / viewing can
                // never trigger the "use in generator" click.
                <div
                  key={wallpaper.id}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 text-left shadow-lg shadow-black/40 transition hover:border-violet-400/40 focus-within:ring-2 focus-within:ring-violet-400/60"
                >
                  <button
                    type="button"
                    onClick={() => handleCardClick(wallpaper.styleId)}
                    aria-label={t("cardUseAria", {
                      title: localizedTitle(wallpaper),
                    })}
                    className="block w-full outline-none"
                  >
                    <div className="aspect-[3/4] w-full overflow-hidden">
                      <WallpaperImage
                        src={wallpaper.image}
                        alt={localizedAlt(wallpaper)}
                        gradient={wallpaper.gradient}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]"
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <h3 className="truncate text-sm font-semibold text-white md:text-base">
                        {localizedTitle(wallpaper)}
                      </h3>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-zinc-400">
                          {tStyles(wallpaper.styleId)}
                        </p>
                        <span
                          aria-hidden
                          className="shrink-0 text-xs font-medium text-violet-300 opacity-0 transition duration-300 group-hover:opacity-100"
                        >
                          {t("useInGenerator")}
                        </span>
                      </div>
                    </div>
                  </button>
                  <DownloadIconButton
                    busy={downloadingIds.has(wallpaper.id)}
                    label={t("cardDownloadAria", {
                      title: localizedTitle(wallpaper),
                    })}
                    className="absolute left-3 top-3 h-9 w-9"
                    onDownload={() => handleDownloadGalleryWallpaper(wallpaper)}
                  />
                  <button
                    type="button"
                    onClick={() => setDetailId(wallpaper.id)}
                    aria-label={t("cardViewAria", {
                      title: localizedTitle(wallpaper),
                    })}
                    className="absolute right-3 top-14 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-zinc-300 outline-none backdrop-blur transition hover:border-white/40 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/60"
                  >
                    <ExpandIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleGalleryFavorite(wallpaper)}
                    aria-pressed={favorited}
                    aria-label={
                      favorited
                        ? t("cardUnfavoriteAria", {
                            title: localizedTitle(wallpaper),
                          })
                        : t("cardFavoriteAria", {
                            title: localizedTitle(wallpaper),
                          })
                    }
                    className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border outline-none backdrop-blur transition focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                      favorited
                        ? "border-fuchsia-400/60 bg-fuchsia-500/25 text-fuchsia-300"
                        : "border-white/15 bg-black/50 text-zinc-300 hover:border-white/40 hover:text-white"
                    }`}
                  >
                    <HeartIcon filled={favorited} className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail dialog — reuses the generator's Lightbox (single modal
          system). Presets carry no generation params, so the meta line is
          honest: category, style and a "curated demo" marker — never fake
          prompts, dates or authors. */}
      {detailWallpaper && (
        <Lightbox
          src={detailWallpaper.image}
          alt={localizedAlt(detailWallpaper)}
          gradient={detailWallpaper.gradient}
          title={localizedTitle(detailWallpaper)}
          meta={t("detailMeta", {
            group: detailWallpaper
              ? (() => {
                  const group = STYLE_GROUPS.find(
                    (candidate) =>
                      candidate.id ===
                      STYLE_CATEGORY.get(detailWallpaper.styleId)
                  );
                  return group ? tGroups(group.id) : t("filterFallbackGroup");
                })()
              : t("filterFallbackGroup"),
            style: tStyles(detailWallpaper.styleId) || t("filterFallbackStyle"),
          })}
          description={localizedAlt(detailWallpaper)}
          onClose={() => setDetailId(null)}
        >
          <button
            type="button"
            onClick={() => handleToggleGalleryFavorite(detailWallpaper)}
            aria-pressed={favoriteKeys.has(
              favoriteKeyOf(
                "gallery",
                detailWallpaper.id,
                detailWallpaper.image
              )
            )}
            aria-label={
              favoriteKeys.has(
                favoriteKeyOf("gallery", detailWallpaper.id, detailWallpaper.image)
              )
                ? t("cardUnfavoriteAria", {
                    title: localizedTitle(detailWallpaper),
                  })
                : t("cardFavoriteAria", {
                    title: localizedTitle(detailWallpaper),
                  })
            }
            className={`flex h-9 w-9 items-center justify-center rounded-full border outline-none backdrop-blur transition focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
              favoriteKeys.has(
                favoriteKeyOf("gallery", detailWallpaper.id, detailWallpaper.image)
              )
                ? "border-fuchsia-400/60 bg-fuchsia-500/25 text-fuchsia-300"
                : "border-white/15 bg-black/50 text-zinc-300 hover:border-white/40 hover:text-white"
            }`}
          >
            <HeartIcon
              filled={favoriteKeys.has(
                favoriteKeyOf(
                  "gallery",
                  detailWallpaper.id,
                  detailWallpaper.image
                )
              )}
              className="h-4 w-4"
            />
          </button>
          <button
            type="button"
            onClick={() => handleCreateSimilar(detailWallpaper)}
            className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-xs font-semibold transition hover:brightness-110"
          >
            {t("createSimilar")}
          </button>
        </Lightbox>
      )}
    </section>
  );
}
