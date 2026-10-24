"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  STYLE_GROUPS,
  WALLPAPER_STYLES,
  findStyle,
  getStylesByGroup,
  type StyleCategory,
  type WallStyle,
} from "@/lib/styles";
import WallpaperImage from "./WallpaperImage";

interface StylePickerProps {
  styleId: WallStyle["id"] | null;
  /** Called with the clicked style id, or null when the active style is toggled off. */
  onSelect: (id: WallStyle["id"] | null) => void;
  disabled: boolean;
}

/** Cards visible before "Show all" in a category. */
const INITIAL_VISIBLE = 6;

/**
 * Grouped style library: category tabs + a searchable grid of thumbnail
 * cards (artwork or gradient fallback + name + one-line description).
 * Callers decide the initial selection: the Studio starts on a valid default
 * style, while the homepage generator starts with none. Clicking the active
 * card deselects it.
 */
export default function StylePicker({
  styleId,
  onSelect,
  disabled,
}: StylePickerProps) {
  const t = useTranslations();
  const [activeGroupId, setActiveGroupId] = useState<StyleCategory>(
    () => findStyle(styleId ?? "")?.category ?? STYLE_GROUPS[0].id
  );
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Keep the visible group in sync when the style is set from outside (style
  // cards dispatch wallhaze:set-style): adjusted during render, per the
  // official "adjusting state when a prop changes" pattern.
  const [prevStyleId, setPrevStyleId] = useState(styleId);
  if (prevStyleId !== styleId) {
    setPrevStyleId(styleId);
    const category = styleId ? findStyle(styleId)?.category : undefined;
    if (category) setActiveGroupId(category);
  }

  const activeGroup =
    STYLE_GROUPS.find((group) => group.id === activeGroupId) ?? STYLE_GROUPS[0];
  const searching = query.trim().length > 0;
  const styles = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return getStylesByGroup(activeGroup.id);
    return WALLPAPER_STYLES.filter((style) => {
      const haystack = `${style.label} ${t(`styleLabels.${style.id}`)} ${t(
        `styleDescriptions.${style.id}`
      )}`;
      return haystack.toLowerCase().includes(term);
    });
  }, [activeGroup.id, query, t]);

  const visible = searching || showAll ? styles : styles.slice(0, INITIAL_VISIBLE);
  const hasMore = !searching && !showAll && styles.length > INITIAL_VISIBLE;
  const selected = styleId ? findStyle(styleId) : undefined;

  return (
    <fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="text-base font-semibold text-zinc-100">
          {t("generator.styleLegend")}
        </legend>
        {selected ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(null)}
            className="text-xs text-violet-300 underline-offset-4 transition enabled:hover:text-violet-200 enabled:hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("generator.clearStyle")}
          </button>
        ) : null}
      </div>

      <label className="relative mt-3 block">
        <span className="sr-only">{t("generator.searchStyles")}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShowAll(false);
          }}
          placeholder={t("generator.searchStyles")}
          disabled={disabled}
          className="w-full rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      {!searching ? (
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="group"
          aria-label={t("generator.styleCategoriesAria")}
        >
          {STYLE_GROUPS.map((group) => {
            const active = group.id === activeGroupId;
            return (
              <button
                key={group.id}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => {
                  setActiveGroupId(group.id);
                  setShowAll(false);
                }}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? "border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-100"
                    : "border-white/10 bg-transparent text-zinc-400 hover:border-white/25 hover:text-zinc-200"
                }`}
              >
                {t(`groupLabels.${group.id}`)}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">
          {t("generator.searchResults", { count: styles.length })}
        </p>
      )}

      {!searching ? (
        <p className="mt-1.5 text-xs text-zinc-500">
          {t(`groupDescriptions.${activeGroup.id}`)}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">
          {t("generator.noStyleResults")}
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {visible.map((style) => {
            const active = styleId === style.id;
            return (
              <li key={style.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => onSelect(active ? null : style.id)}
                  className={`group w-full overflow-hidden rounded-xl border text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? "border-violet-400/70 bg-violet-500/15 ring-1 ring-violet-400/50"
                      : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]"
                  }`}
                >
                  <span className="relative block aspect-[16/10] overflow-hidden bg-black/40">
                    {style.image ? (
                      <WallpaperImage
                        src={style.image}
                        alt=""
                        gradient={style.gradient}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className={`block h-full w-full bg-gradient-to-br ${style.gradient} opacity-80`}
                      />
                    )}
                    {active ? (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-[11px] font-bold text-white shadow">
                        ✓
                      </span>
                    ) : null}
                    {!style.image ? (
                      <span className="absolute bottom-1.5 left-2 text-[10px] font-medium uppercase tracking-wide text-white/80">
                        {t("generator.styleArtPreview")}
                      </span>
                    ) : null}
                  </span>
                  <span className="block p-2.5">
                    <span className="block text-sm font-medium text-zinc-100">
                      {t(`styleLabels.${style.id}`)}
                    </span>
                    <span className="mt-0.5 line-clamp-1 block text-xs leading-snug text-zinc-400">
                      {t(`styleDescriptions.${style.id}`)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowAll(true)}
          className="mt-4 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-sm font-medium text-zinc-300 transition enabled:hover:border-white/25 enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("generator.showAllStyles", { count: styles.length })}
        </button>
      ) : null}
    </fieldset>
  );
}
