import type { WallStyle } from "@/lib/styles";

/**
 * The Studio opens with a valid, enabled style so an ordinary visitor can
 * press Generate without making a technical choice. The homepage generator
 * deliberately keeps "no style selected" — this default is Studio-only.
 */
export const STUDIO_DEFAULT_STYLE_ID: WallStyle["id"] = "anime";
