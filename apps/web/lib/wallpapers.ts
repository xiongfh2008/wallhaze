import {
  WALLPAPER_STYLES,
  type StyleCategory,
  type StyleId,
  type WallStyle,
} from "@/lib/styles";
import {
  aspectRatioValue,
  nativeDevicesFor,
  type DeviceCategory,
} from "@/lib/media";

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
 * The original 39 preset artworks remain "review-pending" (no per-file
 * license evidence). New additions are either "verified" CC0/public-domain
 * photos with a traceable source, or explicitly "self-authored" procedural
 * art. The UI must never present an unverified file as commercial-use ready.
 */
export type WallpaperLicenseStatus =
  | "review-pending"
  | "verified"
  | "self-authored";

/** Traceable source for a licensed photo wallpaper. */
export interface WallpaperSource {
  title: string;
  pageUrl: string;
  author: string;
  license: string;
  licenseUrl: string | null;
}

/** A gallery entry as consumed by the UI — every field is resolved. */
export interface PresetWallpaper {
  /** Stable, URL-safe identifier — doubles as the /wallpapers/[slug] param. */
  id: string;
  title: string;
  /** References an existing entry of WALLPAPER_STYLES — never a new style. */
  styleId: StyleId;
  /**
   * Public image URL, or null when the artwork is not cleared for public
   * display. A null value is a hard UI signal: render a gradient placeholder,
   * never fetch a hidden/legacy file.
   */
  image: string | null;
  /** Fallback gradient, taken from the linked style (single source of truth). */
  gradient: string;
  alt: string;
  /** Per-wallpaper licensing status. Defaults to "review-pending". */
  license: WallpaperLicenseStatus;
  /** Server-publishable rights decision mirrored for the UI. */
  reviewStatus: "pending" | "verified" | "restricted" | "rejected" | "removed";
  /** True only when a cleared file may be shown publicly. */
  canPubliclyDisplay: boolean;
  /** True only when the cleared file may be offered as a download. */
  canOfferDownload: boolean;
  /** Present for licensed photo assets; absent for self-authored art. */
  source?: WallpaperSource;
  /** Static gallery media metadata, measured from the actual file. */
  mediaType: "image";
  width: number;
  height: number;
  aspectRatio: number;
  /** Native device class derived from actual width/height; no fake variants. */
  nativeDevices: DeviceCategory[];
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
  /** Display-only: the asset is public but download is withheld (2026-10-31). */
  displayOnly?: boolean;
  source?: WallpaperSource;
}

const IMAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "sakura-nights": { width: 768, height: 1368 },
  "neon-rain": { width: 768, height: 1368 },
  "floating-isles": { width: 768, height: 1368 },
  "twilight-peaks": { width: 768, height: 1368 },
  "violet-orb": { width: 768, height: 1368 },
  "mirror-desert": { width: 768, height: 1368 },
  "nebula-city": { width: 1368, height: 768 },
  "astral-drift": { width: 768, height: 1368 },
  "liquid-ribbons": { width: 576, height: 1024 },
  "storm-ridge": { width: 576, height: 1024 },
  "chrome-orbit": { width: 576, height: 1024 },
  "haze-room": { width: 576, height: 1024 },
  "ring-station": { width: 576, height: 1024 },
  "dawn-lake": { width: 576, height: 1024 },
  "graphite-valley": { width: 576, height: 1024 },
  "charcoal-sea": { width: 576, height: 1024 },
  "crane-pine": { width: 576, height: 1024 },
  "bloom-wash": { width: 576, height: 1024 },
  "impasto-night": { width: 576, height: 1024 },
  "pixel-skyline": { width: 576, height: 1024 },
  "neon-alley": { width: 576, height: 1024 },
  "crimson-keep": { width: 576, height: 1024 },
  "the-drifter": { width: 576, height: 1024 },
  "the-unseen": { width: 576, height: 1024 },
  "tape-07": { width: 576, height: 1024 },
  "wrong-room": { width: 576, height: 1024 },
  "melting-hour": { width: 576, height: 1024 },
  "cursed-grove": { width: 576, height: 1024 },
  "ash-highway": { width: 576, height: 1024 },
  "after-class": { width: 576, height: 1024 },
  "the-circle": { width: 576, height: 1024 },
  "last-train": { width: 576, height: 1024 },
  "petal-bloom": { width: 576, height: 1024 },
  "ignition": { width: 576, height: 1024 },
  "cloud-friends": { width: 576, height: 1024 },
  "rooftop-duel": { width: 576, height: 1024 },
  "hangar-rain": { width: 576, height: 1024 },
  "great-wave": { width: 576, height: 1024 },
  "sunset-cafe": { width: 576, height: 1024 },
  "sakura-dream": { width: 1080, height: 1440 },
  "galaxy-tide": { width: 1080, height: 1440 },
  "stillwater-dawn": { width: 1080, height: 1440 },
  "abyssal-bloom": { width: 1080, height: 1440 },
  "aurora-veil": { width: 1080, height: 1440 },
  "quiet-geometry": { width: 1080, height: 1440 },
  "dewline": { width: 1080, height: 1440 },
  "poppy-field": { width: 1080, height: 1440 },
  "soft-horizon": { width: 1080, height: 1440 },
  "nebula-drift": { width: 1920, height: 1080 },
  "stillwater-night": { width: 1920, height: 1080 },
  "hong-kong-rain": { width: 1920, height: 1080 },
  "forest-rays": { width: 1920, height: 1080 },
  "quiet-bridge": { width: 1920, height: 1080 },
  "jellyfish-deep": { width: 1920, height: 1080 },
  "sunset-platform": { width: 1920, height: 1080 },
  "aurora-veil-wide": { width: 1920, height: 1080 },
  "light-ribbons-wide": { width: 1920, height: 1080 },
  "mecha-girl-neon-city": { width: 1536, height: 864 },
  "tokyo-neon-rain-night": { width: 1536, height: 864 },
  "starship-ring-planet": { width: 1536, height: 864 },
  "gothic-castle-moonlight": { width: 1536, height: 864 },
  "sakura-tram-station": { width: 864, height: 1536 },
  "highway-sunset-classic-car": { width: 1536, height: 864 },
  "dreamcore-floating-room": { width: 1536, height: 1152 },
  "synthwave-car-sunset": { width: 864, height: 1536 },
  "dragon-sky-citadel": { width: 1536, height: 864 },
  "pixel-rainy-city": { width: 1536, height: 864 },
  "abandoned-manor-dread": { width: 1536, height: 864 },
  "hypercar-scifi-city": { width: 1536, height: 864 },
  "mystic-girl-night-sky": { width: 864, height: 1536 },
  "black-hole-voyage": { width: 1536, height: 864 },
  "neon-motorcycle-night": { width: 1536, height: 864 },
  "skydeck-future-city": { width: 1536, height: 864 },
  "samurai-shrine-rain": { width: 864, height: 1536 },
  "starlit-glowing-ocean": { width: 864, height: 1536 },
  "clay-toon-cozy-world": { width: 1536, height: 1152 },
  "amoled-violet-halo": { width: 1536, height: 864 },
  "deep-sea-glow-cosmos": { width: 1536, height: 864 },
  "anime-bedroom-cityscape": { width: 864, height: 1536 },
  "retro-motel-alien-sky": { width: 1536, height: 864 },
  "ukiyo-anime-fusion": { width: 1536, height: 864 },
  "b2-mecha-battleline": { width: 1536, height: 864 },
  "b2-cyber-nightmarket": { width: 1536, height: 864 },
  "b2-interstellar-gate": { width: 1536, height: 864 },
  "b2-dark-citadel-throne": { width: 1536, height: 864 },
  "b2-jp-aesthetic-alley": { width: 1536, height: 864 },
  "b2-vaporwave-mall": { width: 1536, height: 864 },
  "b2-dreamcore-playground": { width: 1536, height: 864 },
  "b2-gothic-cathedral": { width: 1536, height: 864 },
  "b2-roadmovie-dusk": { width: 1536, height: 864 },
  "b2-samurai-standoff": { width: 1536, height: 864 },
  "b2-pixel-arcade-world": { width: 1536, height: 864 },
  "b2-race-future-circuit": { width: 1536, height: 864 },
  "b2-galaxy-river-mountain": { width: 1536, height: 864 },
  "b2-magic-forest-spirits": { width: 1536, height: 864 },
  "b2-amoled-obsidian-wave": { width: 1536, height: 864 },
  "b2-anime-festival-night": { width: 1536, height: 864 },
  "b2-mech-pilot-gaze": { width: 864, height: 1536 },
  "b2-cyber-alley-cat": { width: 864, height: 1536 },
  "b2-lofi-rain-window": { width: 864, height: 1536 },
  "b2-galaxy-cliff-temple": { width: 864, height: 1536 },
  "b2-magic-forest-well": { width: 864, height: 1536 },
  "b2-vaporwave-bust": { width: 864, height: 1536 },
  "b2-dreamcore-doorfield": { width: 1536, height: 1152 },
  "b2-magic-forest-clearing": { width: 1536, height: 1152 },
  "color-burst-puppy": { width: 928, height: 1232 },
  "sunshine-puppy-portrait": { width: 928, height: 1232 },
};

const STYLE_BY_ID = new Map<StyleId, WallStyle>(
  WALLPAPER_STYLES.map((style): [StyleId, WallStyle] => [style.id, style])
);

function resolveWallpaper(seed: PresetWallpaperSeed): PresetWallpaper {
  const style = STYLE_BY_ID.get(seed.styleId);
  if (!style) {
    throw new Error(
      `[wallpapers] Seed "${seed.id}" references unknown style "${seed.styleId}".`
    );
  }
  const license = seed.license ?? "review-pending";
  const pending = license === "review-pending";
  // A pending entry deliberately carries no image URL at all. That keeps
  // legacy local paths and remote generator URLs out of the HTML/bundle even
  // though the seed may still document them for the audit trail.
  const image = pending ? null : (seed.imageOverride ?? style.image ?? null);
  if (!pending && !image) {
    throw new Error(
      `[wallpapers] Seed "${seed.id}" has no resolvable cleared image (styleId: ${seed.styleId}).`
    );
  }
  const dimensions = IMAGE_DIMENSIONS[seed.id];
  if (!dimensions) {
    throw new Error(`[wallpapers] Seed "${seed.id}" has no measured dimensions.`);
  }
  // Display and download are independent decisions:
  //   - review-pending → both false (hidden entirely)
  //   - displayOnly: true → display yes, download no
  //   - default (verified/self-authored) → both true
  const canPubliclyDisplay = !pending;
  const canOfferDownload = !pending && !seed.displayOnly;
  return {
    id: seed.id,
    title: seed.title,
    styleId: seed.styleId,
    image,
    gradient: style.gradient,
    alt: seed.alt,
    license,
    reviewStatus: pending ? "pending" : "verified",
    canPubliclyDisplay,
    canOfferDownload,
    ...(seed.source ? { source: seed.source } : {}),
    mediaType: "image",
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio: aspectRatioValue(dimensions.width, dimensions.height),
    nativeDevices: nativeDevicesFor(dimensions.width, dimensions.height),
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
  },
  {
    id: "astral-drift",
    title: "Astral Drift",
    styleId: "sci-fi",
    alt: "Sci-fi wallpaper of an astronaut floating in a glowing purple nebula surrounded by stars",
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
  // Licensed/photographic tablet and desktop additions. Every source was
  // checked as CC0 (or explicitly public domain) on Wikimedia Commons; the
  // files are reproducible crops, never stretched variants.
  {
    id: "sakura-dream",
    title: "Sakura Dream",
    styleId: "cinematic",
    alt: "Pink cherry blossoms against a soft blue sky",
    imageOverride: "/images/wallpapers/sakura-dream.jpg",
    license: "verified",
    source: {
          "title": "Cherry blossom against blue sky (Unsplash)",
          "author": "indah nur indaheart",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Cherry_blossom_against_blue_sky_(Unsplash).jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "galaxy-tide",
    title: "Galaxy Tide",
    styleId: "starry-galaxy",
    alt: "Deep blue and green nebula clouds with dense star fields",
    license: "verified",
    source: {
          "title": "Carina Nebula in Hubble Palette",
          "author": "Dylan O'Donnell",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Carina_Nebula_in_Hubble_Palette_Rasa_8_ORIGINAL_unsharpened.jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "stillwater-dawn",
    title: "Stillwater Dawn",
    styleId: "mountain-lake",
    alt: "Moonlit mountain lake with mirrored reflections and a dark forest ridge",
    license: "verified",
    source: {
          "title": "Mountain Lake at Night",
          "author": "cweyant",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Mountain_Lake_at_Night_(30608832416).jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "abyssal-bloom",
    title: "Abyssal Bloom",
    styleId: "deep-ocean",
    alt: "Glowing orange lion's mane jellyfish drifting in deep blue water",
    license: "verified",
    source: {
          "title": "Lion's mane jellyfish in Gullmarn fjord at Sämstad 3",
          "author": "W.carter",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Lion%27s_mane_jellyfish_in_Gullmarn_fjord_at_S%C3%A4mstad_3.jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "aurora-veil",
    title: "Aurora Veil",
    styleId: "aurora-nights",
    alt: "Green and pink aurora over a snowy mountain and calm fjord",
    license: "verified",
    source: {
          "title": "Lofoten, Norway (Unsplash)",
          "author": "Johannes Groll",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Lofoten,_Norway_(Unsplash).jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "quiet-geometry",
    title: "Quiet Geometry",
    styleId: "architecture-minimal",
    alt: "Minimal white interior with a black lamp, glass desk and architecture books",
    license: "verified",
    source: {
          "title": "Minimalist office decor at 1540 7th St (Unsplash)",
          "author": "Breather",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Minimalist_office_decor_at_1540_7th_St_(Unsplash).jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "dewline",
    title: "Dewline",
    styleId: "macro-nature",
    alt: "Macro photograph of dew drops beading along a bright green leaf",
    license: "verified",
    source: {
          "title": "Dew on a thin leaf in macro (Unsplash)",
          "author": "Jono Hislop",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Dew_on_a_thin_leaf_in_macro_(Unsplash).jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "poppy-field",
    title: "Poppy Field",
    styleId: "photography",
    alt: "Close-up of red poppies and white wildflowers in a summer meadow",
    imageOverride: "/images/wallpapers/poppy-field.jpg",
    license: "verified",
    source: {
          "title": "Poppy field, Oberauroff, detail",
          "author": "Gerda Arendt",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Poppy_field,_Oberauroff,_detail.jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "soft-horizon",
    title: "Soft Horizon",
    styleId: "soft-gradient",
    alt: "Soft violet and amber gradient horizon with a gentle glow",
    license: "self-authored",
  },
  {
    id: "nebula-drift",
    title: "Nebula Drift",
    styleId: "starry-galaxy",
    imageOverride: "/images/wallpapers/nebula-drift.jpg",
    alt: "Wide field of blue and emerald nebula clouds and stars in deep space",
    license: "verified",
    source: {
          "title": "Carina Nebula in Hubble Palette",
          "author": "Dylan O'Donnell",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Carina_Nebula_in_Hubble_Palette_Rasa_8_ORIGINAL_unsharpened.jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "stillwater-night",
    title: "Stillwater Night",
    styleId: "mountain-lake",
    imageOverride: "/images/wallpapers/stillwater-night.jpg",
    alt: "Moonlit lake and forest silhouette under a deep blue night sky",
    license: "verified",
    source: {
          "title": "Mountain Lake at Night",
          "author": "cweyant",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Mountain_Lake_at_Night_(30557164961).jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "hong-kong-rain",
    title: "Neon District",
    styleId: "cyberpunk",
    imageOverride: "/images/wallpapers/hong-kong-rain.jpg",
    alt: "Rainy Hong Kong street glowing with red, green and blue neon signs",
    license: "verified",
    source: {
          "title": "Hong Kong in the night",
          "author": "Wilfredor",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Hong_Kong_in_the_night.jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "forest-rays",
    title: "Forest Cathedral",
    styleId: "nature",
    imageOverride: "/images/wallpapers/forest-rays.jpg",
    alt: "Sun rays breaking through tall trees and morning mist",
    license: "verified",
    source: {
          "title": "Sunrise breaking into the forest (Unsplash)",
          "author": "Kristine Weilert",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Sunrise_breaking_into_the_forest_(Unsplash).jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "quiet-bridge",
    title: "Quiet Bridge",
    styleId: "architecture-minimal",
    imageOverride: "/images/wallpapers/quiet-bridge.jpg",
    alt: "Illuminated pedestrian bridge reflected in dark water at night",
    license: "verified",
    source: {
          "title": "Queens Bridge, Melbourne",
          "author": "Bernard Spragg. NZ",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Queens_Bridge._Melbourne.Aust._(21793578980).jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "jellyfish-deep",
    title: "Jellyfish Deep",
    styleId: "deep-ocean",
    imageOverride: "/images/wallpapers/jellyfish-deep.jpg",
    alt: "Lion's mane jellyfish trailing long tentacles in dark water",
    license: "verified",
    source: {
          "title": "Lion's mane jellyfish in Gullmarn fjord at Sämstad 8",
          "author": "W.carter",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Lion%27s_mane_jellyfish_in_Gullmarn_fjord_at_S%C3%A4mstad_8.jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "sunset-platform",
    title: "Sunset Platform",
    styleId: "cinematic",
    imageOverride: "/images/wallpapers/sunset-platform.jpg",
    alt: "Empty railway platforms under a glowing orange sunset",
    license: "verified",
    source: {
          "title": "Sunset Bruges station",
          "author": "Antonio Borrillo",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Sunset_Bruges_station.JPG",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "aurora-veil-wide",
    title: "Aurora Veil Wide",
    styleId: "aurora-nights",
    imageOverride: "/images/wallpapers/aurora-veil.jpg",
    alt: "Green and purple aurora above a dark pine forest",
    license: "verified",
    source: {
          "title": "Polar lights over dark trees (Unsplash)",
          "author": "Vincent Guth",
          "pageUrl": "https://commons.wikimedia.org/wiki/File:Polar_lights_over_dark_trees_(Unsplash).jpg",
          "license": "CC0",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
    },
  },
  {
    id: "light-ribbons-wide",
    title: "Light Ribbons",
    styleId: "abstract-light",
    imageOverride: "/images/wallpapers/light-ribbons-wide.jpg",
    alt: "Abstract ribbons of violet, cyan and amber light on a dark field",
    license: "self-authored",
  },

  {
    id: "mecha-girl-neon-city",
    title: "Mecha Girl: Neon Skyline",
    styleId: "mecha",
    imageOverride: "/images/wallpapers/mecha-girl-neon-city.jpg",
    alt: "Original anime mecha girl on a rooftop above a neon megacity skyline",
    license: "self-authored",
  },
  {
    id: "tokyo-neon-rain-night",
    title: "Tokyo Rain: Neon Night",
    styleId: "cyberpunk",
    imageOverride: "/images/wallpapers/tokyo-neon-rain-night.jpg",
    alt: "Rainy futuristic street reflecting blue and purple neon",
    license: "self-authored",
  },
  {
    id: "starship-ring-planet",
    title: "Voyage Past the Ring",
    styleId: "sci-fi",
    imageOverride: "/images/wallpapers/starship-ring-planet.jpg",
    alt: "Starship crossing a giant ringed planet in deep space",
    license: "self-authored",
  },
  {
    id: "gothic-castle-moonlight",
    title: "Moonlit Citadel",
    styleId: "gothic-horror",
    imageOverride: "/images/wallpapers/gothic-castle-moonlight.jpg",
    alt: "Gothic castle on a cliff under a full moon with drifting fog",
    license: "self-authored",
  },
  {
    id: "sakura-tram-station",
    title: "Petals at the Last Stop",
    styleId: "cozy-anime",
    imageOverride: "/images/wallpapers/sakura-tram-station.jpg",
    alt: "Anime tram station at dusk with drifting cherry blossoms",
    license: "self-authored",
  },
  {
    id: "highway-sunset-classic-car",
    title: "Golden Hour Run",
    styleId: "cinematic",
    imageOverride: "/images/wallpapers/highway-sunset-classic-car.jpg",
    alt: "Classic car driving into a huge desert sunset on an open highway",
    license: "self-authored",
  },
  {
    id: "dreamcore-floating-room",
    title: "Room Above the Clouds",
    styleId: "dreamcore",
    imageOverride: "/images/wallpapers/dreamcore-floating-room.jpg",
    alt: "A furnished room floating on an island above an endless cloud sea",
    license: "self-authored",
  },
  {
    id: "synthwave-car-sunset",
    title: "Grid Sunset",
    styleId: "vaporwave",
    imageOverride: "/images/wallpapers/synthwave-car-sunset.jpg",
    alt: "Retro sports car on a neon grid road toward a striped sunset",
    license: "self-authored",
  },
  {
    id: "dragon-sky-citadel",
    title: "Ember Dragon's Flight",
    styleId: "dark-fantasy",
    imageOverride: "/images/wallpapers/dragon-sky-citadel.jpg",
    alt: "Ember-winged dragon circling a floating citadel above storm clouds",
    license: "self-authored",
  },
  {
    id: "pixel-rainy-city",
    title: "8-Bit Downpour",
    styleId: "pixel-art",
    imageOverride: "/images/wallpapers/pixel-rainy-city.jpg",
    alt: "Pixel-art rainy neon intersection with reflective pavement",
    license: "self-authored",
  },
  {
    id: "abandoned-manor-dread",
    title: "The Silent Manor",
    styleId: "supernatural-horror",
    imageOverride: "/images/wallpapers/abandoned-manor-dread.jpg",
    alt: "Abandoned Victorian manor at dusk with mist and a faint candlelit window",
    license: "self-authored",
  },
  {
    id: "hypercar-scifi-city",
    title: "Lightline Runner",
    styleId: "sci-fi",
    imageOverride: "/images/wallpapers/hypercar-scifi-city.jpg",
    alt: "Futuristic hypercar with glowing light lines speeding through a sci-fi city",
    license: "self-authored",
  },
  {
    id: "mystic-girl-night-sky",
    title: "Stargazer",
    styleId: "anime",
    imageOverride: "/images/wallpapers/mystic-girl-night-sky.jpg",
    alt: "Anime girl gazing up at a towering starry night sky with a faint aurora",
    license: "self-authored",
  },
  {
    id: "black-hole-voyage",
    title: "Event Horizon",
    styleId: "sci-fi",
    imageOverride: "/images/wallpapers/black-hole-voyage.jpg",
    alt: "A tiny vessel beside a black hole's glowing accretion disk",
    license: "self-authored",
  },
  {
    id: "neon-motorcycle-night",
    title: "Wet Apex",
    styleId: "cyberpunk",
    imageOverride: "/images/wallpapers/neon-motorcycle-night.jpg",
    alt: "Neon-accented motorcycle leaning through a wet downtown corner",
    license: "self-authored",
  },
  {
    id: "skydeck-future-city",
    title: "Blue Hour Deck",
    styleId: "cinematic",
    imageOverride: "/images/wallpapers/skydeck-future-city.jpg",
    alt: "Visitor on a glass skydeck above a futuristic megacity at blue hour",
    license: "self-authored",
  },
  {
    id: "samurai-shrine-rain",
    title: "Torii in the Rain",
    styleId: "ukiyo-e-anime",
    imageOverride: "/images/wallpapers/samurai-shrine-rain.jpg",
    alt: "Samurai before a red torii gate path in heavy rain with glowing lanterns",
    license: "self-authored",
  },
  {
    id: "starlit-glowing-ocean",
    title: "Between Two Skies",
    styleId: "dreamcore",
    imageOverride: "/images/wallpapers/starlit-glowing-ocean.jpg",
    alt: "A small boat between a starlit sky and a bioluminescent ocean",
    license: "self-authored",
  },
  {
    id: "clay-toon-cozy-world",
    title: "Little Floating Village",
    styleId: "clay-3d",
    imageOverride: "/images/wallpapers/clay-toon-cozy-world.jpg",
    alt: "Cute 3D clay houses with glowing windows on floating grass islands",
    license: "self-authored",
  },
  {
    id: "amoled-violet-halo",
    title: "Pure Glow",
    styleId: "dark",
    imageOverride: "/images/wallpapers/amoled-violet-halo.jpg",
    alt: "Single glowing violet halo ring on a pure black AMOLED background",
    license: "self-authored",
  },
  {
    id: "deep-sea-glow-cosmos",
    title: "Abyssal Constellation",
    styleId: "dreamcore",
    imageOverride: "/images/wallpapers/deep-sea-glow-cosmos.jpg",
    alt: "Bioluminescent deep-sea creatures drifting like a galaxy",
    license: "self-authored",
  },
  {
    id: "anime-bedroom-cityscape",
    title: "Lo-Fi Night In",
    styleId: "cozy-anime",
    imageOverride: "/images/wallpapers/anime-bedroom-cityscape.jpg",
    alt: "Cozy anime bedroom with a warm lamp and a glowing city nightscape outside",
    license: "self-authored",
  },
  {
    id: "retro-motel-alien-sky",
    title: "Vacancy Beyond",
    styleId: "vaporwave",
    imageOverride: "/images/wallpapers/retro-motel-alien-sky.jpg",
    alt: "Retro desert motel with a neon sign under an alien sky with two moons",
    license: "self-authored",
  },
  {
    id: "ukiyo-anime-fusion",
    title: "The Great Modern Wave",
    styleId: "ukiyo-e-anime",
    imageOverride: "/images/wallpapers/ukiyo-anime-fusion.jpg",
    alt: "Ukiyo-e woodblock wave fused with modern anime and a distant skyline",
    license: "self-authored",
  },
  {
    id: "b2-mecha-battleline",
    title: "Mecha Battleline",
    styleId: "mecha",
    imageOverride: "/images/wallpapers/b2-mecha-battleline.jpg",
    alt: "Original mecha squad advancing through a ruined future boulevard at dawn",
    license: "self-authored",
  },
  {
    id: "b2-cyber-nightmarket",
    title: "Night Market Canal",
    styleId: "cyberpunk",
    imageOverride: "/images/wallpapers/b2-cyber-nightmarket.jpg",
    alt: "Cyberpunk night market with lanterns reflecting in a black canal",
    license: "self-authored",
  },
  {
    id: "b2-interstellar-gate",
    title: "The Jump Gate",
    styleId: "sci-fi",
    imageOverride: "/images/wallpapers/b2-interstellar-gate.jpg",
    alt: "Titanic jump-gate opening a swirling portal above an exploration fleet",
    license: "self-authored",
  },
  {
    id: "b2-dark-citadel-throne",
    title: "Throne of Embers",
    styleId: "dark-fantasy",
    imageOverride: "/images/wallpapers/b2-dark-citadel-throne.jpg",
    alt: "Dark citadel throne hall with moonlight shafts and drifting embers",
    license: "self-authored",
  },
  {
    id: "b2-jp-aesthetic-alley",
    title: "Lantern Lane",
    styleId: "ukiyo-e-anime",
    imageOverride: "/images/wallpapers/b2-jp-aesthetic-alley.jpg",
    alt: "Japanese alley with paper lanterns and a Mount Fuji sunset",
    license: "self-authored",
  },
  {
    id: "b2-vaporwave-mall",
    title: "Flooded Arcade",
    styleId: "vaporwave",
    imageOverride: "/images/wallpapers/b2-vaporwave-mall.jpg",
    alt: "Abandoned retro mall flooded with water under pink-cyan neon",
    license: "self-authored",
  },
  {
    id: "b2-dreamcore-playground",
    title: "Playground in the Sky",
    styleId: "dreamcore",
    imageOverride: "/images/wallpapers/b2-dreamcore-playground.jpg",
    alt: "Impossible playground standing on clouds under three soft suns",
    license: "self-authored",
  },
  {
    id: "b2-gothic-cathedral",
    title: "Midnight Cathedral",
    styleId: "gothic-horror",
    imageOverride: "/images/wallpapers/b2-gothic-cathedral.jpg",
    alt: "Gothic cathedral interior with glowing stained glass at midnight",
    license: "self-authored",
  },
  {
    id: "b2-roadmovie-dusk",
    title: "Dusk Convertible",
    styleId: "cinematic",
    imageOverride: "/images/wallpapers/b2-roadmovie-dusk.jpg",
    alt: "Vintage convertible on a west-coast highway at dusk",
    license: "self-authored",
  },
  {
    id: "b2-samurai-standoff",
    title: "Storm Ronin",
    styleId: "ukiyo-e-anime",
    imageOverride: "/images/wallpapers/b2-samurai-standoff.jpg",
    alt: "Original samurai standing in a bamboo grove during a lightning storm",
    license: "self-authored",
  },
  {
    id: "b2-pixel-arcade-world",
    title: "Pixel Skylands",
    styleId: "pixel-art",
    imageOverride: "/images/wallpapers/b2-pixel-arcade-world.jpg",
    alt: "Pixel-art floating islands connected by neon bridges",
    license: "self-authored",
  },
  {
    id: "b2-race-future-circuit",
    title: "Antigrav Circuit",
    styleId: "sci-fi",
    imageOverride: "/images/wallpapers/b2-race-future-circuit.jpg",
    alt: "Anti-gravity race cars charging through a neon circuit tunnel",
    license: "self-authored",
  },
  {
    id: "b2-galaxy-river-mountain",
    title: "Star River",
    styleId: "sci-fi",
    imageOverride: "/images/wallpapers/b2-galaxy-river-mountain.jpg",
    alt: "The Milky Way pouring between mountain ridges over a mirrored lake",
    license: "self-authored",
  },
  {
    id: "b2-magic-forest-spirits",
    title: "Spore Spirits",
    styleId: "dreamcore",
    imageOverride: "/images/wallpapers/b2-magic-forest-spirits.jpg",
    alt: "Glowing spore-spirits floating between colossal mossy trunks",
    license: "self-authored",
  },
  {
    id: "b2-amoled-obsidian-wave",
    title: "Obsidian Wave",
    styleId: "dark",
    imageOverride: "/images/wallpapers/b2-amoled-obsidian-wave.jpg",
    alt: "A sweep of violet-to-blue light across a near-black obsidian field",
    license: "self-authored",
  },
  {
    id: "b2-anime-festival-night",
    title: "Festival Lights",
    styleId: "cozy-anime",
    imageOverride: "/images/wallpapers/b2-anime-festival-night.jpg",
    alt: "Anime festival street with yukata crowds and fireworks",
    license: "self-authored",
  },
  {
    id: "b2-mech-pilot-gaze",
    title: "Pilot and Titan",
    styleId: "mecha",
    imageOverride: "/images/wallpapers/b2-mech-pilot-gaze.jpg",
    alt: "Original mecha pilot before her towering mechanical partner",
    license: "self-authored",
  },
  {
    id: "b2-cyber-alley-cat",
    title: "Neon Alley Cat",
    styleId: "cyberpunk",
    imageOverride: "/images/wallpapers/b2-cyber-alley-cat.jpg",
    alt: "Robotic cat on a crate in a flickering neon alley",
    license: "self-authored",
  },
  {
    id: "b2-lofi-rain-window",
    title: "Rainy Day Lo-Fi",
    styleId: "cozy-anime",
    imageOverride: "/images/wallpapers/b2-lofi-rain-window.jpg",
    alt: "Rain on a large window with a steaming mug and a sleeping cat",
    license: "self-authored",
  },
  {
    id: "b2-galaxy-cliff-temple",
    title: "Cliffside Temple",
    styleId: "sci-fi",
    imageOverride: "/images/wallpapers/b2-galaxy-cliff-temple.jpg",
    alt: "A tiny temple on a cliff beneath a river of stars",
    license: "self-authored",
  },
  {
    id: "b2-magic-forest-well",
    title: "The Glowing Well",
    styleId: "dreamcore",
    imageOverride: "/images/wallpapers/b2-magic-forest-well.jpg",
    alt: "Ancient glowing well in an enchanted forest clearing",
    license: "self-authored",
  },
  {
    id: "b2-vaporwave-bust",
    title: "Neon Visor",
    styleId: "vaporwave",
    imageOverride: "/images/wallpapers/b2-vaporwave-bust.jpg",
    alt: "Classical plaster bust with a chrome visor in a vaporwave room",
    license: "self-authored",
  },
  {
    id: "b2-dreamcore-doorfield",
    title: "Field of Doors",
    styleId: "dreamcore",
    imageOverride: "/images/wallpapers/b2-dreamcore-doorfield.jpg",
    alt: "Standing doors in a cloud meadow opening onto different skies",
    license: "self-authored",
  },
  {
    id: "b2-magic-forest-clearing",
    title: "Mushroom Circle",
    styleId: "dreamcore",
    imageOverride: "/images/wallpapers/b2-magic-forest-clearing.jpg",
    alt: "Glowing mushroom circle around an old stone bench at twilight",
    license: "self-authored",
  },
  {
    // User-uploaded AI-generated wallpaper (2026-11-14 import; provider and
    // output terms not provided) — review-pending by the standard mechanism:
    // no image, noindex, no download until a human reviewer records the
    // provider terms (registry: incoming.wallpaper.color-burst-puppy).
    id: "color-burst-puppy",
    title: "Color Burst Puppy",
    styleId: "oil-painting",
    alt: "A cheerful fluffy white puppy jumping forward against vibrant blue, orange, pink and yellow brushstrokes",
  },
  {
    // User-uploaded AI-generated wallpaper — same review-pending isolation as
    // above (registry: incoming.wallpaper.sunshine-puppy-portrait).
    id: "sunshine-puppy-portrait",
    title: "Sunshine Puppy Portrait",
    styleId: "oil-painting",
    alt: "A fluffy white puppy portrait with bright eyes and a playful expression, surrounded by golden yellow, pink and turquoise brushstrokes",
  },
] satisfies readonly PresetWallpaperSeed[];

export const PRESET_WALLPAPERS: PresetWallpaper[] = SEEDS.map(resolveWallpaper);

/**
 * The only list the public gallery may render: every entry is both flagged
 * for public display and backed by a resolvable cleared image. review-pending
 * entries stay in PRESET_WALLPAPERS for the audit trail/detail pages but are
 * invisible to the gallery, filters, counts, search and related picks.
 */
export const PUBLIC_WALLPAPERS: PresetWallpaper[] = PRESET_WALLPAPERS.filter(
  (wallpaper) => wallpaper.canPubliclyDisplay && wallpaper.image !== null
);

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

/** Only cleared/self-authored assets may be downloaded from the public UI. */
export function isDownloadAllowed(license: WallpaperLicenseStatus): boolean {
  return license !== "review-pending";
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
  // Related picks come from the public list only — a review-pending preset
  // must never surface as a recommendation card.
  return PUBLIC_WALLPAPERS.filter(
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
  // 2026-10-31 batch 2 (owner-directed): exactly nine landscape originals for
  // the uniform 16:9 three-column grid — nine themes, no mixed ratios.
  "b2-interstellar-gate",
  "b2-cyber-nightmarket",
  "b2-mecha-battleline",
  "b2-galaxy-river-mountain",
  "b2-jp-aesthetic-alley",
  "b2-magic-forest-spirits",
  "b2-gothic-cathedral",
  "b2-anime-festival-night",
  "b2-roadmovie-dusk",

];

export const FEATURED_WALLPAPERS: PresetWallpaper[] =
  FEATURED_WALLPAPER_IDS.map(
    (id) => PUBLIC_WALLPAPERS.find((wallpaper) => wallpaper.id === id)
  ).filter((wallpaper): wallpaper is PresetWallpaper => wallpaper !== undefined);

/**
 * Homepage "More styles, more inspiration" spotlight — explicit style IDs
 * (never auto-derived) spanning the theme families the band should show:
 * anime characters, aurora, nature close-ups, digital art, minimal
 * architecture, sci-fi, dreamy fantasy and retro futurism.
 *
 * Every referenced style must carry a registry-gated preview image, and no
 * two cards may share an image. Each card links to the style's cleared preset
 * wallpaper when one exists (so the card image matches the detail page),
 * otherwise to the studio preselected with that style.
 */
const STYLE_SPOTLIGHT_IDS: readonly StyleId[] = [
  "anime",
  "cyberpunk",
  "sci-fi",
  "dark-fantasy",
  "vaporwave",
  "cozy-anime",
  "cinematic",
  "dreamcore",
  "gothic-horror",
  "pixel-art",
  "ukiyo-e-anime",
  "dark",
];

export interface StyleSpotlightItem {
  style: WallStyle;
  /** Cleared preset wallpaper showcasing this style, when one exists. */
  wallpaper: PresetWallpaper | null;
}

export const STYLE_SPOTLIGHT: StyleSpotlightItem[] = STYLE_SPOTLIGHT_IDS.map(
  (id) => {
    const style = WALLPAPER_STYLES.find((candidate) => candidate.id === id);
    if (!style?.image) {
      throw new Error(
        `[wallpapers] Style spotlight "${id}" has no cleared preview image.`
      );
    }
    // SEEDS order lists portrait presets before wide variants, so find()
    // resolves the portrait detail page matching the 3:4 card. A preset
    // whose art differs from the style preview is NOT attached — the card
    // then links to the Studio preselected with that style instead (the
    // card must never show art other than what it links to).
    const wallpaper =
      PRESET_WALLPAPERS.find(
        (candidate) =>
          candidate.styleId === id &&
          candidate.canPubliclyDisplay &&
          candidate.image === style.image
      ) ?? null;
    return { style, wallpaper };
  }
);

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
