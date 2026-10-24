/**
 * Gallery read-only contract (T04-S1).
 *
 * Mirrors the static preset wallpaper shape in lib/wallpapers.ts
 * (PresetWallpaper). In S1 the gallery data stays static inside apps/web;
 * this contract exists so a future gallery API (or apps/api) can serve the
 * same read-only shape without breaking the frontend.
 */
export interface GalleryWallpaper {
    /** Stable, URL-safe identifier (future deep links / previews). */
    readonly id: string;
    readonly title: string;
    /** References an existing style id — never a new style. */
    readonly styleId: string;
    /** Public image URL or app-relative path (e.g. /images/styles/xxx.jpg). */
    readonly image: string;
    /** Fallback gradient, taken from the linked style (single source of truth). */
    readonly gradient: string;
    /** Localized accessibility description of the artwork. */
    readonly alt: string;
}
