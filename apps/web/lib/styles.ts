export type StyleId =
  | "anime"
  | "cyberpunk"
  | "fantasy"
  | "nature"
  | "minimalist"
  | "surreal"
  | "abstract"
  | "dark"
  | "3d-art"
  | "dreamcore"
  | "sci-fi"
  | "photography"
  | "pencil-sketch"
  | "charcoal-drawing"
  | "ink-drawing"
  | "watercolor"
  | "oil-painting"
  | "pixel-art"
  | "cinematic"
  | "gothic-horror"
  | "supernatural-horror"
  | "cosmic-horror"
  | "analog-horror"
  | "psychological-horror"
  | "nightmare-surrealism"
  | "dark-fantasy"
  | "post-apocalyptic"
  | "horror-anime"
  | "occult-ritual"
  | "retro-cel"
  | "shoujo"
  | "shonen"
  | "chibi"
  | "manga"
  | "mecha"
  | "ukiyo-e-anime"
  | "cozy-anime";

/** Style family used for grouping (gallery filters, future browsing pages). */
export type StyleCategory =
  | "sketch"
  | "painting"
  | "digital"
  | "photography"
  | "nature"
  | "abstract"
  | "horror";

export interface WallStyle {
  id: StyleId;
  label: string;
  /** Optional style family for grouping (gallery filters, future pages). */
  category?: StyleCategory;
  /** Sample artwork URL — remote CDN for the popular six, local generated
   *  assets (public/images/styles/) for every other style. */
  image?: string;
  /** CSS gradient classes used as fallback / placeholder artwork. */
  gradient: string;
  /** Style descriptor appended to the user prompt for real AI generation. */
  promptTemplate: string;
}

/**
 * Remote artwork source. Prompts are generated per style and URL-encoded here,
 * so no Next.js image domain configuration is needed (plain <img> is used).
 */
const wallImage = (prompt: string, size: string) =>
  `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
    prompt
  )}&image_size=${size}`;

const PORTRAIT = "portrait_16_9";

export const WALLPAPER_STYLES: WallStyle[] = [
  {
    id: "anime",
    label: "Anime",
    category: "digital",
    image: wallImage(
      "anime wallpaper art, girl in school uniform standing under glowing cherry blossoms at night, purple lantern light, dreamy violet sky, studio anime illustration, highly detailed",
      PORTRAIT
    ),
    gradient: "from-fuchsia-600 via-purple-800 to-slate-950",
    promptTemplate:
      "anime style illustration, clean line art, vibrant cel shading, expressive mood, studio quality, high-resolution wallpaper, sharp detail",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    category: "digital",
    image: wallImage(
      "cyberpunk city wallpaper at night, neon purple and cyan signs, rain soaked street reflections, towering futuristic skyscrapers, cinematic digital art, moody atmosphere",
      PORTRAIT
    ),
    gradient: "from-cyan-500 via-indigo-800 to-black",
    promptTemplate:
      "cyberpunk aesthetic, neon lights, futuristic city at night, rain reflections, cinematic glow, high-resolution wallpaper, sharp detail",
  },
  {
    id: "fantasy",
    label: "Fantasy",
    category: "digital",
    image: wallImage(
      "epic fantasy wallpaper, floating islands with glowing waterfalls above a violet mist valley, magical light rays, detailed digital painting",
      PORTRAIT
    ),
    gradient: "from-violet-500 via-purple-900 to-slate-950",
    promptTemplate:
      "epic fantasy art, magical atmosphere, painterly detail, dramatic lighting, high-resolution wallpaper, sharp detail",
  },
  {
    id: "nature",
    label: "Nature",
    category: "nature",
    image: wallImage(
      "serene nature wallpaper, misty mountain peaks at twilight under a deep purple and blue gradient sky, minimal moody landscape photography",
      PORTRAIT
    ),
    gradient: "from-teal-500 via-indigo-900 to-black",
    promptTemplate:
      "photorealistic nature landscape, natural light, serene composition, rich color, high-resolution wallpaper, sharp detail",
  },
  {
    id: "minimalist",
    label: "Minimalist",
    category: "abstract",
    image: wallImage(
      "minimalist abstract wallpaper, soft glowing violet gradient orb centered on a deep dark background, clean smooth design, subtle film grain",
      PORTRAIT
    ),
    gradient: "from-zinc-600 via-zinc-900 to-black",
    promptTemplate:
      "minimalist design, clean composition, generous negative space, subtle gradients, elegant simplicity, high-resolution wallpaper",
  },
  {
    id: "surreal",
    label: "Surreal",
    category: "abstract",
    image: wallImage(
      "surreal dreamscape wallpaper, giant glowing moon over a mirror like desert with a lone standing door, purple and pink palette, imaginative fine art",
      PORTRAIT
    ),
    gradient: "from-pink-500 via-violet-800 to-slate-950",
    promptTemplate:
      "surreal dreamscape, imaginative composition, dreamlike atmosphere, fine art quality, high-resolution wallpaper, sharp detail",
  },
  { id: "abstract", label: "Abstract", category: "abstract", image: "/images/styles/abstract.jpg", gradient: "from-fuchsia-500 via-violet-700 to-indigo-950", promptTemplate: "abstract art, bold shapes, fluid color gradients, modern composition, high-resolution wallpaper" },
  { id: "dark", label: "Dark", category: "photography", image: "/images/styles/dark.jpg", gradient: "from-slate-700 via-slate-900 to-black", promptTemplate: "dark moody aesthetic, deep shadows, low-key lighting, mysterious atmosphere, high-resolution wallpaper" },
  { id: "3d-art", label: "3D Art", category: "digital", image: "/images/styles/3d-art.jpg", gradient: "from-blue-500 via-violet-800 to-slate-950", promptTemplate: "polished 3D render, soft studio lighting, glossy materials, high detail, high-resolution wallpaper" },
  { id: "dreamcore", label: "Dreamcore", category: "abstract", image: "/images/styles/dreamcore.jpg", gradient: "from-pink-400 via-fuchsia-700 to-indigo-900", promptTemplate: "dreamcore aesthetic, ethereal pastel haze, nostalgic surreal atmosphere, soft focus, high-resolution wallpaper" },
  { id: "sci-fi", label: "Sci-Fi", category: "digital", image: "/images/styles/sci-fi.jpg", gradient: "from-sky-500 via-blue-800 to-slate-950", promptTemplate: "sci-fi concept art, futuristic technology, epic scale, volumetric lighting, high-resolution wallpaper, sharp detail" },
  { id: "photography", label: "Photography", category: "photography", image: "/images/styles/photography.jpg", gradient: "from-stone-500 via-stone-800 to-black", promptTemplate: "professional photography, sharp focus, natural bokeh, high dynamic range, high-resolution wallpaper" },
  {
    id: "pencil-sketch",
    label: "Pencil Sketch",
    category: "sketch",
    image: "/images/styles/pencil-sketch.jpg",
    gradient: "from-stone-200 via-stone-400 to-stone-700",
    promptTemplate:
      "detailed pencil sketch, graphite shading, hand-drawn linework on textured paper, monochrome tones, fine art drawing, high-resolution wallpaper",
  },
  {
    id: "charcoal-drawing",
    label: "Charcoal Drawing",
    category: "sketch",
    image: "/images/styles/charcoal-drawing.jpg",
    gradient: "from-zinc-600 via-zinc-800 to-black",
    promptTemplate:
      "expressive charcoal drawing, bold smudged strokes, deep blacks and soft grey shading, textured paper grain, fine art sketch, high-resolution wallpaper",
  },
  {
    id: "ink-drawing",
    label: "Ink Drawing",
    category: "sketch",
    image: "/images/styles/ink-drawing.jpg",
    gradient: "from-slate-300 via-slate-600 to-slate-950",
    promptTemplate:
      "ink drawing, confident black ink linework, cross-hatching and stippling detail, sumi-e brush accents, high-contrast monochrome, high-resolution wallpaper",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    category: "painting",
    image: "/images/styles/watercolor.jpg",
    gradient: "from-sky-300 via-violet-400 to-fuchsia-500",
    promptTemplate:
      "delicate watercolor painting, soft translucent washes, blooming pigments and paper texture, gentle light, artistic whitespace, high-resolution wallpaper",
  },
  {
    id: "oil-painting",
    label: "Oil Painting",
    category: "painting",
    image: "/images/styles/oil-painting.jpg",
    gradient: "from-amber-600 via-red-800 to-stone-950",
    promptTemplate:
      "classical oil painting, rich impasto brushwork, layered pigments, dramatic chiaroscuro lighting, museum quality fine art, high-resolution wallpaper",
  },
  {
    id: "pixel-art",
    label: "Pixel Art",
    category: "digital",
    image: "/images/styles/pixel-art.jpg",
    gradient: "from-emerald-400 via-cyan-600 to-indigo-900",
    promptTemplate:
      "pixel art wallpaper, crisp limited-palette pixels, retro 16-bit game aesthetic, clean dithering, chunky detail, high-resolution wallpaper",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    category: "photography",
    image: "/images/styles/cinematic.jpg",
    gradient: "from-teal-500 via-slate-900 to-amber-600",
    promptTemplate:
      "cinematic film still, anamorphic widescreen mood, teal and orange color grade, volumetric light, shallow depth of field, dramatic composition, high-resolution wallpaper",
  },
  /* ---- Horror & Dark ---- */
  {
    id: "gothic-horror",
    label: "Gothic Horror",
    category: "horror",
    image: "/images/styles/gothic-horror.jpg",
    gradient: "from-red-900 via-zinc-900 to-black",
    promptTemplate:
      "gothic horror art, haunted castle silhouettes, moonlight, black and crimson palette, ornate architecture, ominous atmosphere, high-resolution wallpaper, sharp detail",
  },
  {
    id: "supernatural-horror",
    label: "Supernatural Horror",
    category: "horror",
    image: "/images/styles/supernatural-horror.jpg",
    gradient: "from-slate-600 via-slate-900 to-black",
    promptTemplate:
      "supernatural horror art, ghostly apparitions, eerie light and shadow, abandoned buildings, unsettling atmosphere, high-resolution wallpaper, sharp detail",
  },
  {
    id: "cosmic-horror",
    label: "Cosmic Horror",
    category: "horror",
    image: "/images/styles/cosmic-horror.jpg",
    gradient: "from-indigo-800 via-slate-950 to-black",
    promptTemplate:
      "cosmic horror art, deep space void, unknowable colossal entities, non-euclidean forms, dread scale, high-resolution wallpaper, sharp detail",
  },
  {
    id: "analog-horror",
    label: "Analog Horror",
    category: "horror",
    image: "/images/styles/analog-horror.jpg",
    gradient: "from-lime-900 via-zinc-900 to-black",
    promptTemplate:
      "analog horror aesthetic, VHS scanlines and noise, grainy surveillance footage look, distorted imagery, retro CRT artifacts, high-resolution wallpaper",
  },
  {
    id: "psychological-horror",
    label: "Psychological Horror",
    category: "horror",
    image: "/images/styles/psychological-horror.jpg",
    gradient: "from-stone-700 via-zinc-900 to-black",
    promptTemplate:
      "psychological horror art, empty rooms, warped perspective, oppressive silence, liminal unease, high-resolution wallpaper, sharp detail",
  },
  {
    id: "nightmare-surrealism",
    label: "Nightmare Surrealism",
    category: "horror",
    image: "/images/styles/nightmare-surrealism.jpg",
    gradient: "from-purple-800 via-fuchsia-950 to-black",
    promptTemplate:
      "nightmare surrealism, twisted impossible spaces, illogical dream scenes, haunting dreamlike imagery, dark surreal art, high-resolution wallpaper, sharp detail",
  },
  {
    id: "dark-fantasy",
    label: "Dark Fantasy",
    category: "horror",
    image: "/images/styles/dark-fantasy.jpg",
    gradient: "from-emerald-900 via-purple-950 to-black",
    promptTemplate:
      "dark fantasy art, cursed ruins, shadowy forests, mysterious creatures, ominous magic, moody epic detail, high-resolution wallpaper, sharp detail",
  },
  {
    id: "post-apocalyptic",
    label: "Post-Apocalyptic Horror",
    category: "horror",
    image: "/images/styles/post-apocalyptic.jpg",
    gradient: "from-amber-900 via-stone-950 to-black",
    promptTemplate:
      "post-apocalyptic horror art, ruined cities in thick fog, desolate end-of-days atmosphere, decay and overgrowth, high-resolution wallpaper, sharp detail",
  },
  {
    id: "horror-anime",
    label: "Horror Anime",
    category: "horror",
    image: "/images/styles/horror-anime.jpg",
    gradient: "from-red-950 via-purple-950 to-black",
    promptTemplate:
      "horror anime style, japanese horror aesthetic, deep shadows, eerie character silhouettes, unsettling stillness, anime illustration, high-resolution wallpaper, sharp detail",
  },
  {
    id: "occult-ritual",
    label: "Occult & Ritual",
    category: "horror",
    image: "/images/styles/occult-ritual.jpg",
    gradient: "from-amber-950 via-red-950 to-black",
    promptTemplate:
      "occult ritual art, arcane symbols, candlelight, ancient ceremony atmosphere, mystical sigils and smoke, high-resolution wallpaper, sharp detail",
  },
  /* ---- Anime sub-styles ---- */
  {
    id: "retro-cel",
    label: "Retro Cel Anime",
    category: "digital",
    image: "/images/styles/retro-cel.jpg",
    gradient: "from-orange-400 via-fuchsia-700 to-indigo-900",
    promptTemplate:
      "retro 90s anime style, classic cel shading, vintage film grain, nostalgic color palette, hand-painted background, high-resolution wallpaper",
  },
  {
    id: "shoujo",
    label: "Shoujo",
    category: "digital",
    image: "/images/styles/shoujo.jpg",
    gradient: "from-pink-400 via-rose-400 to-fuchsia-600",
    promptTemplate:
      "shoujo anime style, soft pastel palette, sparkling highlights, romantic florals, delicate linework, dreamy mood, high-resolution wallpaper",
  },
  {
    id: "shonen",
    label: "Shonen Action",
    category: "digital",
    image: "/images/styles/shonen.jpg",
    gradient: "from-orange-500 via-red-700 to-indigo-950",
    promptTemplate:
      "shonen anime style, dynamic action composition, speed lines, bold saturated colors, energetic poses, dramatic impact, high-resolution wallpaper",
  },
  {
    id: "chibi",
    label: "Chibi",
    category: "digital",
    image: "/images/styles/chibi.jpg",
    gradient: "from-sky-400 via-violet-500 to-fuchsia-600",
    promptTemplate:
      "chibi anime style, super-deformed cute characters, oversized heads, kawaii pastel colors, playful mood, clean art, high-resolution wallpaper",
  },
  {
    id: "manga",
    label: "Manga",
    category: "digital",
    image: "/images/styles/manga.jpg",
    gradient: "from-zinc-300 via-zinc-600 to-zinc-900",
    promptTemplate:
      "black and white manga art, screentone shading, bold ink linework, dramatic panel composition, monochrome illustration, high-resolution wallpaper",
  },
  {
    id: "mecha",
    label: "Mecha",
    category: "digital",
    image: "/images/styles/mecha.jpg",
    gradient: "from-cyan-500 via-blue-800 to-slate-950",
    promptTemplate:
      "mecha anime style, giant robots with panel line detail, metallic sheen, epic scale hangar or battlefield, technical precision, high-resolution wallpaper",
  },
  {
    id: "ukiyo-e-anime",
    label: "Ukiyo-e Anime",
    category: "digital",
    image: "/images/styles/ukiyo-e-anime.jpg",
    gradient: "from-indigo-400 via-rose-500 to-stone-800",
    promptTemplate:
      "ukiyo-e anime style, japanese woodblock print aesthetic, flat color planes, wave and cloud motifs, elegant traditional composition, high-resolution wallpaper",
  },
  {
    id: "cozy-anime",
    label: "Cozy Anime",
    category: "digital",
    image: "/images/styles/cozy-anime.jpg",
    gradient: "from-emerald-400 via-teal-500 to-sky-700",
    promptTemplate:
      "iyashikei cozy anime style, soothing slice-of-life scenery, warm gentle light, lush greenery, peaceful nostalgic atmosphere, soft colors, high-resolution wallpaper",
  },
];

/**
 * The six styles showcased in the gallery section, picked by explicit ID so
 * appending new styles to WALLPAPER_STYLES never changes the homepage.
 */
const POPULAR_STYLE_IDS: readonly StyleId[] = [
  "anime",
  "cyberpunk",
  "fantasy",
  "nature",
  "minimalist",
  "surreal",
];

export const POPULAR_STYLES: WallStyle[] = POPULAR_STYLE_IDS.map((id) =>
  WALLPAPER_STYLES.find((style) => style.id === id)
).filter((style): style is WallStyle => style !== undefined);

export const HERO_IMAGE = wallImage(
  "breathtaking surreal wallpaper artwork, violet and blue nebula sky over a futuristic city with glowing purple lights, cinematic atmosphere, ultra detailed digital painting, dark moody tones",
  "landscape_16_9"
);

export const DEMO_SAMPLE_IMAGE = wallImage(
  "astronaut floating in a glowing purple nebula surrounded by stars, cinematic sci-fi phone wallpaper, deep violet and blue palette, ultra detailed digital art",
  PORTRAIT
);

/** Custom event used by style cards to update the generator selection. */
export const STYLE_SELECT_EVENT = "wallhaze:set-style";

export function findStyle(id: string): WallStyle | undefined {
  return WALLPAPER_STYLES.find((style) => style.id === id);
}

/* ---- Style library grouping (picker UI) ----
   The existing StyleCategory values are the source of truth — these are
   display-only definitions on top of them, so gallery filters, history and
   the API keep working unchanged. Every style belongs to exactly one group. */

export interface StyleGroup {
  id: StyleCategory;
  /** User-facing group name in the picker. */
  label: string;
  /** One-line group description shown in the picker. */
  description: string;
}

export const STYLE_GROUPS: readonly StyleGroup[] = [
  { id: "digital", label: "Digital Art", description: "Anime, 3D renders, pixel art and concept styles" },
  { id: "abstract", label: "Abstract & Minimal", description: "Gradients, shapes, dreams and surreal scenes" },
  { id: "sketch", label: "Sketch & Drawing", description: "Hand-drawn graphite, ink and charcoal looks" },
  { id: "painting", label: "Painting", description: "Watercolor, oil and painterly textures" },
  { id: "photography", label: "Photography", description: "Realistic, cinematic and moody photographic looks" },
  { id: "nature", label: "Nature & Landscape", description: "Mountains, forests, lakes and open skies" },
  { id: "horror", label: "Horror & Dark", description: "Gothic castles, cosmic dread, cursed ruins and haunting atmospheres" },
];

/** All styles of one group, in declaration order. */
export function getStylesByGroup(groupId: StyleCategory): WallStyle[] {
  return WALLPAPER_STYLES.filter((style) => style.category === groupId);
}

/** One-line blurbs for the picker's preview card, keyed by style id. */
export const STYLE_DESCRIPTIONS: Record<StyleId, string> = {
  anime: "Clean line art and vibrant cel shading",
  cyberpunk: "Neon-soaked futuristic city nights",
  fantasy: "Epic magical worlds and glowing realms",
  nature: "Serene photorealistic landscapes",
  minimalist: "Calm compositions with generous negative space",
  surreal: "Dreamlike, imagination-first fine art",
  abstract: "Bold shapes and fluid color gradients",
  dark: "Moody shadows and low-key atmosphere",
  "3d-art": "Polished renders with soft studio light",
  dreamcore: "Ethereal pastel haze and nostalgia",
  "sci-fi": "Futuristic tech at epic scale",
  photography: "Sharp, natural photographic looks",
  "pencil-sketch": "Graphite linework on textured paper",
  "charcoal-drawing": "Bold smudged strokes and deep blacks",
  "ink-drawing": "Confident black ink and cross-hatching",
  watercolor: "Translucent washes and paper texture",
  "oil-painting": "Rich impasto and chiaroscuro light",
  "pixel-art": "Crisp limited-palette retro pixels",
  cinematic: "Film-still grading and dramatic light",
  "gothic-horror": "Haunted castles in black and crimson",
  "supernatural-horror": "Ghosts and eerie abandoned places",
  "cosmic-horror": "Unknowable entities in the deep void",
  "analog-horror": "VHS noise and distorted surveillance",
  "psychological-horror": "Empty rooms and warped perspective",
  "nightmare-surrealism": "Twisted dream logic and dark reverie",
  "dark-fantasy": "Cursed ruins and shadowy creatures",
  "post-apocalyptic": "Fog-choked ruins after the end",
  "horror-anime": "Japanese horror shadows and silhouettes",
  "occult-ritual": "Candlelit sigils and ancient rites",
  "retro-cel": "Vintage 90s cel-shaded nostalgia",
  shoujo: "Soft pastel romance and sparkles",
  shonen: "Bold action with speed lines",
  chibi: "Kawaii super-deformed cuteness",
  manga: "Black-and-white screentone ink art",
  mecha: "Colossal robots and mechanical epic scale",
  "ukiyo-e-anime": "Woodblock print elegance meets anime",
  "cozy-anime": "Soothing slice-of-life warmth",
};
