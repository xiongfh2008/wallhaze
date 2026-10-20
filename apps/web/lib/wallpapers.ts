import {
  DEMO_SAMPLE_IMAGE,
  HERO_IMAGE,
  WALLPAPER_STYLES,
  type StyleCategory,
  type StyleId,
  type WallStyle,
} from "@/lib/styles";

/**
 * Static preset wallpapers for the Wallpaper Gallery.
 * Pure data — no database, no external API. A future data source only needs
 * to replace this module, not the UI that consumes it.
 *
 * Image policy: every entry must point at a verified real artwork URL.
 * Verified sources (rechecked 2026-10-16): the remote generator still serves
 * its shared "generating" placeholder for prompts it has never produced
 * (301 → …/page_image/default.jpeg, same placeholder MD5 as below), so
 * remote entries only reuse artwork that already exists on the image CDN
 * (popular-style canonical images plus the hero/demo constants). Styles
 * armed later use verified local assets from public/images/styles/.
 */

/**
 * Licensing status of a static gallery wallpaper.
 *
 * NONE of the 39 preset artworks has had its copyright/commercial license
 * individually verified yet (recheck pending, 2026-10). Every entry therefore
 * defaults to "review-pending" and the UI must never present it as
 * "commercial-use allowed" or "reviewed" until a per-wallpaper audit flips
 * the flag explicitly.
 */
export type WallpaperLicenseStatus = "review-pending" | "verified";

/** A gallery entry as consumed by the UI — every field is resolved. */
export interface PresetWallpaper {
  /** Stable, URL-safe identifier — doubles as the /wallpapers/[slug] param. */
  id: string;
  title: string;
  /** References an existing entry of WALLPAPER_STYLES — never a new style. */
  styleId: StyleId;
  image: string;
  /** Fallback gradient, taken from the linked style (single source of truth). */
  gradient: string;
  alt: string;
  /** Per-wallpaper licensing status. Defaults to "review-pending". */
  license: WallpaperLicenseStatus;
}

/**
 * Authoring shape: `imageOverride` swaps in another verified artwork
 * (e.g. HERO_IMAGE / DEMO_SAMPLE_IMAGE) instead of the style's canonical one;
 * `license` opts a seed out of the "review-pending" default once audited.
 */
interface PresetWallpaperSeed {
  id: string;
  title: string;
  styleId: StyleId;
  alt: string;
  imageOverride?: string;
  license?: WallpaperLicenseStatus;
}

const STYLE_BY_ID = new Map<StyleId, WallStyle>(
  WALLPAPER_STYLES.map((style): [StyleId, WallStyle] => [style.id, style])
);

function resolveWallpaper(seed: PresetWallpaperSeed): PresetWallpaper {
  const style = STYLE_BY_ID.get(seed.styleId);
  const image = seed.imageOverride ?? style?.image;
  if (!style || !image) {
    // Fail fast at import time — styleId must exist in lib/styles.ts and the
    // entry must resolve to a verified image (style artwork or an override).
    throw new Error(
      `[wallpapers] Seed "${seed.id}" has no resolvable verified image (styleId: ${seed.styleId}).`
    );
  }
  return {
    id: seed.id,
    title: seed.title,
    styleId: seed.styleId,
    image,
    gradient: style.gradient,
    alt: seed.alt,
    license: seed.license ?? "review-pending",
  };
}

const SEEDS = [
  {
    id: "sakura-nights",
    title: "Sakura Nights",
    styleId: "anime",
    alt: "Anime wallpaper of a girl beneath glowing cherry blossoms at night",
  },
  {
    id: "neon-rain",
    title: "Neon Rain",
    styleId: "cyberpunk",
    alt: "Cyberpunk wallpaper of a neon-lit city street in the rain",
  },
  {
    id: "floating-isles",
    title: "Floating Isles",
    styleId: "fantasy",
    alt: "Fantasy wallpaper of floating islands with glowing waterfalls",
  },
  {
    id: "twilight-peaks",
    title: "Twilight Peaks",
    styleId: "nature",
    alt: "Nature wallpaper of misty mountain peaks at twilight",
  },
  {
    id: "violet-orb",
    title: "Violet Orb",
    styleId: "minimalist",
    alt: "Minimalist wallpaper of a glowing violet orb on a dark background",
  },
  {
    id: "mirror-desert",
    title: "Mirror Desert",
    styleId: "surreal",
    alt: "Surreal wallpaper of a giant moon above a mirror-like desert",
  },
  {
    id: "nebula-city",
    title: "Nebula City",
    styleId: "sci-fi",
    alt: "Sci-fi wallpaper of a violet nebula sky above a futuristic city with glowing purple lights",
    imageOverride: HERO_IMAGE,
  },
  {
    id: "astral-drift",
    title: "Astral Drift",
    styleId: "sci-fi",
    alt: "Sci-fi wallpaper of an astronaut floating in a glowing purple nebula surrounded by stars",
    imageOverride: DEMO_SAMPLE_IMAGE,
  },
  {
    id: "liquid-ribbons",
    title: "Liquid Ribbons",
    styleId: "abstract",
    alt: "Abstract wallpaper of flowing violet and magenta gradient ribbons in dark space",
  },
  {
    id: "storm-ridge",
    title: "Storm Ridge",
    styleId: "dark",
    alt: "Dark wallpaper of a lone silhouette on a foggy ridge under storm clouds",
  },
  {
    id: "chrome-orbit",
    title: "Chrome Orbit",
    styleId: "3d-art",
    alt: "3D wallpaper of an iridescent chrome torus and spheres on a violet backdrop",
  },
  {
    id: "haze-room",
    title: "Haze Room",
    styleId: "dreamcore",
    alt: "Dreamcore wallpaper of a pastel bedroom filled with pink haze and clouds",
  },
  {
    id: "ring-station",
    title: "Ring Station",
    styleId: "sci-fi",
    alt: "Sci-fi wallpaper of a ringed space station orbiting a violet nebula planet",
  },
  {
    id: "dawn-lake",
    title: "Dawn Lake",
    styleId: "photography",
    alt: "Photography wallpaper of a mirror-calm alpine lake at dawn",
  },
  {
    id: "graphite-valley",
    title: "Graphite Valley",
    styleId: "pencil-sketch",
    alt: "Pencil sketch wallpaper of a misty forest valley with a deer",
  },
  {
    id: "charcoal-sea",
    title: "Charcoal Sea",
    styleId: "charcoal-drawing",
    alt: "Charcoal wallpaper of a stormy seascape in bold smudged strokes",
  },
  {
    id: "crane-pine",
    title: "Crane & Pine",
    styleId: "ink-drawing",
    alt: "Ink wallpaper of a crane flying over pine branches in sumi-e style",
  },
  {
    id: "bloom-wash",
    title: "Bloom Wash",
    styleId: "watercolor",
    alt: "Watercolor wallpaper of violet mountains and blooming flowers in translucent washes",
  },
  {
    id: "impasto-night",
    title: "Impasto Night",
    styleId: "oil-painting",
    alt: "Oil painting wallpaper of a swirling starry night over a violet valley",
  },
  {
    id: "pixel-skyline",
    title: "Pixel Skyline",
    styleId: "pixel-art",
    alt: "Pixel art wallpaper of a retro night city skyline under a purple sky",
  },
  {
    id: "neon-alley",
    title: "Neon Alley",
    styleId: "cinematic",
    alt: "Cinematic wallpaper of a rain-soaked neon alley in teal and orange",
  },
  {
    id: "crimson-keep",
    title: "Crimson Keep",
    styleId: "gothic-horror",
    alt: "Gothic horror wallpaper of a haunted castle under a blood-red moon",
  },
  {
    id: "the-drifter",
    title: "The Drifter",
    styleId: "supernatural-horror",
    alt: "Supernatural horror wallpaper of a ghost drifting through an abandoned asylum corridor",
  },
  {
    id: "the-unseen",
    title: "The Unseen",
    styleId: "cosmic-horror",
    alt: "Cosmic horror wallpaper of a colossal entity looming behind a purple nebula",
  },
  {
    id: "tape-07",
    title: "Tape 07",
    styleId: "analog-horror",
    alt: "Analog horror wallpaper of a grainy VHS security frame with a distorted figure",
  },
  {
    id: "wrong-room",
    title: "Wrong Room",
    styleId: "psychological-horror",
    alt: "Psychological horror wallpaper of an endless empty room with impossible angles",
  },
  {
    id: "melting-hour",
    title: "Melting Hour",
    styleId: "nightmare-surrealism",
    alt: "Nightmare surrealism wallpaper of a melting staircase in a crimson dreamscape",
  },
  {
    id: "cursed-grove",
    title: "Cursed Grove",
    styleId: "dark-fantasy",
    alt: "Dark fantasy wallpaper of cursed ruins watched by a glowing-eyed creature in a shadowy forest",
  },
  {
    id: "ash-highway",
    title: "Ash Highway",
    styleId: "post-apocalyptic",
    alt: "Post-apocalyptic wallpaper of fog-swallowed ruins along a cracked highway",
  },
  {
    id: "after-class",
    title: "After Class",
    styleId: "horror-anime",
    alt: "Horror anime wallpaper of a pale girl in a dark school corridor",
  },
  {
    id: "the-circle",
    title: "The Circle",
    styleId: "occult-ritual",
    alt: "Occult wallpaper of a glowing ritual circle ringed by candles in a stone crypt",
  },
  {
    id: "last-train",
    title: "Last Train",
    styleId: "retro-cel",
    alt: "Retro 90s anime wallpaper of a girl on a dusk train in vintage cel shading",
  },
  {
    id: "petal-bloom",
    title: "Petal Bloom",
    styleId: "shoujo",
    alt: "Shoujo anime wallpaper of a girl among pastel rose petals and sparkles",
  },
  {
    id: "ignition",
    title: "Ignition",
    styleId: "shonen",
    alt: "Shonen anime wallpaper of a hero mid-leap with a blazing energy trail",
  },
  {
    id: "cloud-friends",
    title: "Cloud Friends",
    styleId: "chibi",
    alt: "Chibi anime wallpaper of cute super-deformed characters on pastel clouds",
  },
  {
    id: "rooftop-duel",
    title: "Rooftop Duel",
    styleId: "manga",
    alt: "Manga wallpaper of a black-and-white sword duel with screentone shading",
  },
  {
    id: "hangar-rain",
    title: "Hangar Rain",
    styleId: "mecha",
    alt: "Mecha wallpaper of a colossal battle robot in a rainy launch hangar",
  },
  {
    id: "great-wave",
    title: "Great Wave",
    styleId: "ukiyo-e-anime",
    alt: "Ukiyo-e anime wallpaper of a kimono girl beneath an indigo wave and mount fuji",
  },
  {
    id: "sunset-cafe",
    title: "Sunset Cafe",
    styleId: "cozy-anime",
    alt: "Cozy anime wallpaper of a countryside cafe in warm sunset light",
  },
] satisfies readonly PresetWallpaperSeed[];

export const PRESET_WALLPAPERS: PresetWallpaper[] = SEEDS.map(resolveWallpaper);

/* ---- Lookup helpers (single source for list + detail pages) ---- */

/** Map of style id → style family, shared by the list filters and related picks. */
const STYLE_CATEGORY_OF = new Map<StyleId, StyleCategory>(
  WALLPAPER_STYLES.flatMap((style) =>
    style.category ? [[style.id, style.category] as [StyleId, StyleCategory]] : []
  )
);

/** Style family of a style id, or null for uncategorized styles. */
export function styleCategoryOf(styleId: StyleId): StyleCategory | null {
  return STYLE_CATEGORY_OF.get(styleId) ?? null;
}

/** Detail-page lookup: stable slug === preset id. */
export function getWallpaperBySlug(
  slug: string
): PresetWallpaper | undefined {
  return PRESET_WALLPAPERS.find((wallpaper) => wallpaper.id === slug);
}

/**
 * Related wallpapers for the detail page: same style family first (excluding
 * the current one), capped at `limit`. No fake "similarity score" — the
 * relation is exactly "shares a category".
 */
export function getRelatedWallpapers(
  slug: string,
  limit = 8
): PresetWallpaper[] {
  const current = getWallpaperBySlug(slug);
  if (!current) return [];
  const category = styleCategoryOf(current.styleId);
  if (!category) return [];
  return PRESET_WALLPAPERS.filter(
    (wallpaper) =>
      wallpaper.id !== slug &&
      styleCategoryOf(wallpaper.styleId) === category
  ).slice(0, limit);
}

/**
 * Curated homepage selection — explicit IDs (never auto-derived) spanning
 * every style family, hand-picked for visual variety.
 */
const FEATURED_WALLPAPER_IDS: readonly string[] = [
  "sakura-nights",
  "neon-rain",
  "floating-isles",
  "the-unseen",
  "bloom-wash",
  "chrome-orbit",
  "last-train",
  "dawn-lake",
  "cursed-grove",
  "violet-orb",
  "hangar-rain",
  "sunset-cafe",
];

export const FEATURED_WALLPAPERS: PresetWallpaper[] =
  FEATURED_WALLPAPER_IDS.map(
    (id) => PRESET_WALLPAPERS.find((wallpaper) => wallpaper.id === id)
  ).filter((wallpaper): wallpaper is PresetWallpaper => wallpaper !== undefined);

/*
 * Parked prompts (2026-10-14): these six dedicated artworks were removed
 * because the image service returns a shared "generating" placeholder for
 * prompts it has never produced (verified via repeated Cache-Control:
 * no-cache probes over ~1 hour). Restore them once generation is confirmed
 * working again — recheck each URL and compare against placeholder MD5
 * 19A0B822EDB11957055E4588C2159058 (any different hash = real artwork):
 *
 *   moonlit-samurai  (anime)      "anime wallpaper, lone samurai standing on a cliff beneath a giant full moon, violet and blue night tones, dramatic clouds, studio anime illustration, highly detailed"
 *   holo-skyline     (cyberpunk)  "cyberpunk wallpaper, flying vehicles streaming between holographic skyscrapers, purple and cyan light trails, night sky, cinematic digital art, moody atmosphere"
 *   arcane-grove     (fantasy)    "fantasy wallpaper, ancient glowing tree in an enchanted forest clearing, fireflies and magic particles, violet mist, painterly detail, dramatic lighting"
 *   aurora-lake      (nature)     "nature wallpaper, northern lights over a calm mirror lake, deep blue and violet sky, serene landscape photography, natural light, rich color"
 *   soft-dunes       (minimalist) "minimalist wallpaper, smooth flowing sand dunes under soft gradient light, calm pastel violet tones, generous negative space, elegant simplicity"
 *   stairway-tide    (surreal)    "surreal wallpaper, endless staircase rising from a pastel ocean into soft clouds, dreamlike violet and pink palette, imaginative fine art"
 */
