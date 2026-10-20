"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  STYLE_GROUPS,
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

const chipClasses = (active: boolean) =>
  `rounded-full border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
    active
      ? "border-violet-400/70 bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.35)]"
      : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-zinc-100"
  }`;

/**
 * Grouped style picker: six category tabs, then the styles of the selected
 * category as chips. Hovering or focusing a chip shows a small preview card
 * (sample artwork or gradient fallback + blurb) — it never blocks the chips,
 * never triggers a generation, and works without hover (focus / tap).
 *
 * Style/group labels and blurbs resolve through the i18n dictionaries at
 * render time — lib/styles.ts stays the English single source of truth.
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
  const [previewId, setPreviewId] = useState<WallStyle["id"] | null>(null);

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
  const styles = getStylesByGroup(activeGroup.id);
  const previewStyle = previewId ? findStyle(previewId) : undefined;

  return (
    <fieldset>
      <legend className="mb-3 text-sm font-medium text-zinc-300">
        {t("generator.styleLegend")}
      </legend>

      {/* Category tabs */}
      <div
        className="flex flex-wrap gap-2"
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
                setPreviewId(null);
              }}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-100"
                  : "border-white/10 bg-transparent text-zinc-500 hover:border-white/25 hover:text-zinc-200"
              }`}
            >
              {t(`groupLabels.${group.id}`)}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-zinc-600">
        {t(`groupDescriptions.${activeGroup.id}`)}
      </p>

      {/* Style chips + preview, scoped to one category */}
      <div
        className="relative mt-3 flex flex-wrap gap-2"
        onPointerLeave={() => setPreviewId(null)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setPreviewId(null);
        }}
      >
        {styles.map((style) => {
          const active = styleId === style.id;
          return (
            <button
              key={style.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => {
                onSelect(active ? null : style.id);
                setPreviewId(active ? null : style.id);
              }}
              onPointerEnter={() => setPreviewId(style.id)}
              onFocus={() => setPreviewId(style.id)}
              onBlur={() => setPreviewId(null)}
              className={chipClasses(active)}
            >
              {t(`styleLabels.${style.id}`)}
            </button>
          );
        })}

        {/* Preview card. pointer-events-none so it can never trap the cursor
            or steal focus; purely visual (aria-hidden), Escape closes it. */}
        {previewStyle && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-72 rounded-xl border border-white/10 bg-[#0a0710]/95 p-2 shadow-2xl shadow-black/60 backdrop-blur"
          >
            <div className="h-32 overflow-hidden rounded-lg">
              <WallpaperImage
                src={previewStyle.image}
                alt=""
                gradient={previewStyle.gradient}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="px-1.5 pb-0.5 pt-2">
              <p className="text-sm font-medium text-zinc-100">
                {t(`styleLabels.${previewStyle.id}`)}
                {styleId === previewStyle.id && (
                  <span className="ml-2 text-xs font-normal text-violet-300">
                    {t("generator.selected")}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                {t(`styleDescriptions.${previewStyle.id}`)}
              </p>
            </div>
          </div>
        )}
      </div>
    </fieldset>
  );
}
