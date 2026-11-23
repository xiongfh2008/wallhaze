import { PUBLIC_WALLPAPERS, styleCategoryOf, type PresetWallpaper } from "@/lib/wallpapers";
import type { StyleCategory, StyleId } from "@/lib/styles";

/**
 * Curated gallery collections — hand-defined thematic landing pages over the
 * public wallpaper list (e.g. "Dreamcore Wallpapers", "Anime Wallpapers").
 *
 * Publishing rules:
 * - A collection only ever surfaces PUBLIC_WALLPAPERS entries (cleared,
 *   publicly displayable artwork); review-pending assets never appear here.
 * - Collections are launched sparingly and only when the theme owns enough
 *   genuinely matching artwork (>= 8 public pieces) to stand alone as a
 *   search intent — never as thin keyword pages. Removing artwork from the
 *   public list automatically shrinks the collection; an empty collection
 *   page renders nothing indexable (its metadata falls back, the grid is
 *   empty) and the sitemap entry disappears only if the slug is removed here.
 * - Membership is data-driven from lib/wallpapers.ts (style ids / style
 *   families) — no per-wallpaper hand-tagging that could drift.
 */

export interface WallpaperCollection {
  /** URL segment under /wallpapers/collections/. Stable — never rename lightly. */
  slug: string;
  /** Style ids whose cleared artwork belongs to this collection. */
  styleIds?: readonly StyleId[];
  /** Style families (styleCategoryOf) whose cleared artwork belongs here. */
  styleFamilies?: readonly StyleCategory[];
}

export const WALLPAPER_COLLECTIONS: readonly WallpaperCollection[] = [
  {
    // 9 public dreamcore pieces — the theme with real demand evidence
    // (GSC ko query "드림코어 들판", historical de/ko style queries).
    slug: "dreamcore",
    styleIds: ["dreamcore"],
  },
  {
    // 19 public pieces across the anime & manga family (anime, cozy-anime,
    // ukiyo-e-anime, shoujo, shonen, chibi, manga, mecha, retro-cel).
    slug: "anime",
    styleFamilies: ["anime"],
  },
  {
    // 10 public sci-fi pieces (nebula city, ring station, black hole voyage,
    // galaxy river mountains…). Third collection — cleared the >= 8 public
    // works threshold at the 2026-11-23 audit (note: cyberpunk only has 6
    // public pieces and stays a gallery filter, not a collection).
    slug: "sci-fi",
    styleIds: ["sci-fi"],
  },
];

/** Collection lookup by URL slug. */
export function getCollection(slug: string): WallpaperCollection | null {
  return WALLPAPER_COLLECTIONS.find((entry) => entry.slug === slug) ?? null;
}

/** All public wallpapers belonging to a collection, in seed order. */
export function getCollectionWallpapers(
  collection: WallpaperCollection
): PresetWallpaper[] {
  return PUBLIC_WALLPAPERS.filter((wallpaper) => {
    if (collection.styleIds?.includes(wallpaper.styleId)) return true;
    if (collection.styleFamilies) {
      const family = styleCategoryOf(wallpaper.styleId);
      if (family && collection.styleFamilies.includes(family)) return true;
    }
    return false;
  });
}
