import { isStylePreviewPublic } from "@/lib/media-rights";

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
  | "cozy-anime"
  | "anime-fantasy"
  | "paper-cut"
  | "clay-3d"
  | "low-poly"
  | "stained-glass"
  | "vaporwave"
  | "botanical-illustration"
  | "chinese-ink"
  | "starry-galaxy"
  | "mountain-lake"
  | "deep-ocean"
  | "aurora-nights"
  | "architecture-minimal"
  | "macro-nature"
  | "soft-gradient"
  | "abstract-light"
  | "3d-cartoon";

/** Style family used for grouping (gallery filters, future browsing pages). */
export type StyleCategory =
  | "anime"
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
  /** Optional video-specific visual wording; motion guidance is server-side. */
  videoPromptTemplate?: string;
  /** Explicit motion override for this style (optional). */
  motionGuidance?: string;
  /** Media kinds this style is offered for; omitted means both. */
  supportedMediaTypes?: ("image" | "video")[];
}


const RAW_WALLPAPER_STYLES: WallStyle[] = [
  {
    id: "anime",
    label: "Anime Cinematic",
    category: "anime",
    gradient: "from-fuchsia-600 via-purple-800 to-slate-950",
    promptTemplate:
      "anime style illustration, clean line art, vibrant cel shading, expressive mood, studio quality, high-resolution wallpaper, sharp detail",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    category: "digital",
    gradient: "from-cyan-500 via-indigo-800 to-black",
    promptTemplate:
      "cyberpunk aesthetic, neon lights, futuristic city at night, rain reflections, cinematic glow, high-resolution wallpaper, sharp detail",
  },
  {
    id: "fantasy",
    label: "Fantasy",
    category: "digital",
    gradient: "from-violet-500 via-purple-900 to-slate-950",
    promptTemplate:
      "epic fantasy art, magical atmosphere, painterly detail, dramatic lighting, high-resolution wallpaper, sharp detail",
  },
  {
    id: "nature",
    label: "Nature",
    category: "nature",
    gradient: "from-teal-500 via-indigo-900 to-black",
    promptTemplate:
      "photorealistic nature landscape, natural light, serene composition, rich color, high-resolution wallpaper, sharp detail",
  },
  {
    id: "minimalist",
    label: "Minimalist",
    category: "abstract",
    gradient: "from-zinc-600 via-zinc-900 to-black",
    promptTemplate:
      "minimalist design, clean composition, generous negative space, subtle gradients, elegant simplicity, high-resolution wallpaper",
  },
  {
    id: "surreal",
    label: "Surreal",
    category: "abstract",
    gradient: "from-pink-500 via-violet-800 to-slate-950",
    promptTemplate:
      "surreal dreamscape, imaginative composition, dreamlike atmosphere, fine art quality, high-resolution wallpaper, sharp detail",
  },
  { id: "abstract", label: "Abstract", category: "abstract", gradient: "from-fuchsia-500 via-violet-700 to-indigo-950", promptTemplate: "abstract art, bold shapes, fluid color gradients, modern composition, high-resolution wallpaper" },
  { id: "dark", label: "Dark", category: "photography", gradient: "from-slate-700 via-slate-900 to-black", promptTemplate: "dark moody aesthetic, deep shadows, low-key lighting, mysterious atmosphere, high-resolution wallpaper" },
  { id: "3d-art", label: "3D Art", category: "digital", gradient: "from-blue-500 via-violet-800 to-slate-950", promptTemplate: "polished 3D render, soft studio lighting, glossy materials, high detail, high-resolution wallpaper" },
  { id: "dreamcore", label: "Dreamcore", category: "abstract", gradient: "from-pink-400 via-fuchsia-700 to-indigo-900", promptTemplate: "dreamcore aesthetic, ethereal pastel haze, nostalgic surreal atmosphere, soft focus, high-resolution wallpaper" },
  { id: "sci-fi", label: "Sci-Fi", category: "digital", gradient: "from-sky-500 via-blue-800 to-slate-950", promptTemplate: "sci-fi concept art, futuristic technology, epic scale, volumetric lighting, high-resolution wallpaper, sharp detail" },
  { id: "photography", label: "Photography", category: "photography", gradient: "from-stone-500 via-stone-800 to-black", promptTemplate: "professional photography, sharp focus, natural bokeh, high dynamic range, high-resolution wallpaper" },
  {
    id: "pencil-sketch",
    label: "Pencil Sketch",
    category: "sketch",
    gradient: "from-stone-200 via-stone-400 to-stone-700",
    promptTemplate:
      "detailed pencil sketch, graphite shading, hand-drawn linework on textured paper, monochrome tones, fine art drawing, high-resolution wallpaper",
  },
  {
    id: "charcoal-drawing",
    label: "Charcoal Drawing",
    category: "sketch",
    gradient: "from-zinc-600 via-zinc-800 to-black",
    promptTemplate:
      "expressive charcoal drawing, bold smudged strokes, deep blacks and soft grey shading, textured paper grain, fine art sketch, high-resolution wallpaper",
  },
  {
    id: "ink-drawing",
    label: "Ink Drawing",
    category: "sketch",
    gradient: "from-slate-300 via-slate-600 to-slate-950",
    promptTemplate:
      "ink drawing, confident black ink linework, cross-hatching and stippling detail, sumi-e brush accents, high-contrast monochrome, high-resolution wallpaper",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    category: "painting",
    gradient: "from-sky-300 via-violet-400 to-fuchsia-500",
    promptTemplate:
      "delicate watercolor painting, soft translucent washes, blooming pigments and paper texture, gentle light, artistic whitespace, high-resolution wallpaper",
  },
  {
    id: "oil-painting",
    label: "Oil Painting",
    category: "painting",
    gradient: "from-amber-600 via-red-800 to-stone-950",
    promptTemplate:
      "classical oil painting, rich impasto brushwork, layered pigments, dramatic chiaroscuro lighting, museum quality fine art, high-resolution wallpaper",
  },
  {
    id: "pixel-art",
    label: "Pixel Art",
    category: "digital",
    gradient: "from-emerald-400 via-cyan-600 to-indigo-900",
    promptTemplate:
      "pixel art wallpaper, crisp limited-palette pixels, retro 16-bit game aesthetic, clean dithering, chunky detail, high-resolution wallpaper",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    category: "photography",
    gradient: "from-teal-500 via-slate-900 to-amber-600",
    promptTemplate:
      "cinematic film still, anamorphic widescreen mood, teal and orange color grade, volumetric light, shallow depth of field, dramatic composition, high-resolution wallpaper",
  },
  /* ---- Horror & Dark ---- */
  {
    id: "gothic-horror",
    label: "Gothic Horror",
    category: "horror",
    gradient: "from-red-900 via-zinc-900 to-black",
    promptTemplate:
      "gothic horror art, haunted castle silhouettes, moonlight, black and crimson palette, ornate architecture, ominous atmosphere, high-resolution wallpaper, sharp detail",
  },
  {
    id: "supernatural-horror",
    label: "Supernatural Horror",
    category: "horror",
    gradient: "from-slate-600 via-slate-900 to-black",
    promptTemplate:
      "supernatural horror art, ghostly apparitions, eerie light and shadow, abandoned buildings, unsettling atmosphere, high-resolution wallpaper, sharp detail",
  },
  {
    id: "cosmic-horror",
    label: "Cosmic Horror",
    category: "horror",
    gradient: "from-indigo-800 via-slate-950 to-black",
    promptTemplate:
      "cosmic horror art, deep space void, unknowable colossal entities, non-euclidean forms, dread scale, high-resolution wallpaper, sharp detail",
  },
  {
    id: "analog-horror",
    label: "Analog Horror",
    category: "horror",
    gradient: "from-lime-900 via-zinc-900 to-black",
    promptTemplate:
      "analog horror aesthetic, VHS scanlines and noise, grainy surveillance footage look, distorted imagery, retro CRT artifacts, high-resolution wallpaper",
  },
  {
    id: "psychological-horror",
    label: "Psychological Horror",
    category: "horror",
    gradient: "from-stone-700 via-zinc-900 to-black",
    promptTemplate:
      "psychological horror art, empty rooms, warped perspective, oppressive silence, liminal unease, high-resolution wallpaper, sharp detail",
  },
  {
    id: "nightmare-surrealism",
    label: "Nightmare Surrealism",
    category: "horror",
    gradient: "from-purple-800 via-fuchsia-950 to-black",
    promptTemplate:
      "nightmare surrealism, twisted impossible spaces, illogical dream scenes, haunting dreamlike imagery, dark surreal art, high-resolution wallpaper, sharp detail",
  },
  {
    id: "dark-fantasy",
    label: "Dark Fantasy",
    category: "horror",
    gradient: "from-emerald-900 via-purple-950 to-black",
    promptTemplate:
      "dark fantasy art, cursed ruins, shadowy forests, mysterious creatures, ominous magic, moody epic detail, high-resolution wallpaper, sharp detail",
  },
  {
    id: "post-apocalyptic",
    label: "Post-Apocalyptic Horror",
    category: "horror",
    gradient: "from-amber-900 via-stone-950 to-black",
    promptTemplate:
      "post-apocalyptic horror art, ruined cities in thick fog, desolate end-of-days atmosphere, decay and overgrowth, high-resolution wallpaper, sharp detail",
  },
  {
    id: "horror-anime",
    label: "Horror Anime",
    category: "horror",
    gradient: "from-red-950 via-purple-950 to-black",
    promptTemplate:
      "horror anime style, japanese horror aesthetic, deep shadows, eerie character silhouettes, unsettling stillness, anime illustration, high-resolution wallpaper, sharp detail",
  },
  {
    id: "occult-ritual",
    label: "Occult & Ritual",
    category: "horror",
    gradient: "from-amber-950 via-red-950 to-black",
    promptTemplate:
      "occult ritual art, arcane symbols, candlelight, ancient ceremony atmosphere, mystical sigils and smoke, high-resolution wallpaper, sharp detail",
  },
  /* ---- Anime sub-styles ---- */
  {
    id: "retro-cel",
    label: "Retro Anime",
    category: "anime",
    gradient: "from-orange-400 via-fuchsia-700 to-indigo-900",
    promptTemplate:
      "retro 90s anime style, classic cel shading, vintage film grain, nostalgic color palette, hand-painted background, high-resolution wallpaper",
  },
  {
    id: "shoujo",
    label: "Shojo Romance",
    category: "anime",
    gradient: "from-pink-400 via-rose-400 to-fuchsia-600",
    promptTemplate:
      "shoujo anime style, soft pastel palette, sparkling highlights, romantic florals, delicate linework, dreamy mood, high-resolution wallpaper",
  },
  {
    id: "shonen",
    label: "Shonen Action",
    category: "anime",
    gradient: "from-orange-500 via-red-700 to-indigo-950",
    promptTemplate:
      "shonen anime style, dynamic action composition, speed lines, bold saturated colors, energetic poses, dramatic impact, high-resolution wallpaper",
  },
  {
    id: "chibi",
    label: "Chibi Kawaii",
    category: "anime",
    gradient: "from-sky-400 via-violet-500 to-fuchsia-600",
    promptTemplate:
      "chibi anime style, super-deformed cute characters, oversized heads, kawaii pastel colors, playful mood, clean art, high-resolution wallpaper",
  },
  {
    id: "manga",
    label: "Manga",
    category: "anime",
    gradient: "from-zinc-300 via-zinc-600 to-zinc-900",
    promptTemplate:
      "black and white manga art, screentone shading, bold ink linework, dramatic panel composition, monochrome illustration, high-resolution wallpaper",
  },
  {
    id: "mecha",
    label: "Mecha Sci-Fi",
    category: "anime",
    gradient: "from-cyan-500 via-blue-800 to-slate-950",
    promptTemplate:
      "mecha anime style, giant robots with panel line detail, metallic sheen, epic scale hangar or battlefield, technical precision, high-resolution wallpaper",
  },
  {
    id: "ukiyo-e-anime",
    label: "Ukiyo-e Anime",
    category: "anime",
    gradient: "from-indigo-400 via-rose-500 to-stone-800",
    promptTemplate:
      "ukiyo-e anime style, japanese woodblock print aesthetic, flat color planes, wave and cloud motifs, elegant traditional composition, high-resolution wallpaper",
  },
  {
    id: "cozy-anime",
    label: "Slice of Life",
    category: "anime",
    gradient: "from-emerald-400 via-teal-500 to-sky-700",
    promptTemplate:
      "iyashikei cozy anime style, soothing slice-of-life scenery, warm gentle light, lush greenery, peaceful nostalgic atmosphere, soft colors, high-resolution wallpaper",
  },
  {
    id: "anime-fantasy",
    label: "Anime Fantasy",
    category: "anime",
    gradient: "from-sky-400 via-violet-600 to-fuchsia-950",
    promptTemplate:
      "anime fantasy adventure art, luminous magic, floating ruins and enchanted forests, expressive characters, painterly anime backgrounds, cinematic wonder, high-resolution wallpaper",
  },
  {
    id: "paper-cut",
    label: "Paper Cut Art",
    category: "painting",
    gradient: "from-amber-300 via-rose-400 to-stone-800",
    promptTemplate:
      "layered paper cut art, handcrafted paper textures, crisp cut edges, soft drop shadows, dimensional depth, high-resolution wallpaper",
  },
  {
    id: "clay-3d",
    label: "Clay 3D",
    category: "digital",
    gradient: "from-orange-300 via-pink-400 to-violet-700",
    promptTemplate:
      "soft clay 3D render, rounded handcrafted shapes, matte plasticine texture, gentle studio lighting, playful depth, high-resolution wallpaper",
  },
  {
    id: "low-poly",
    label: "Low Poly",
    category: "digital",
    gradient: "from-cyan-400 via-blue-600 to-slate-900",
    promptTemplate:
      "low poly 3D art, faceted geometric surfaces, flat-shaded polygons, minimalist composition, gradient lighting, high-resolution wallpaper",
  },
  {
    id: "stained-glass",
    label: "Stained Glass",
    category: "painting",
    gradient: "from-emerald-400 via-sky-600 to-indigo-900",
    promptTemplate:
      "stained glass window art, luminous colored glass panes, leaded outlines, cathedral light, rich jewel tones, high-resolution wallpaper",
  },
  {
    id: "vaporwave",
    label: "Vaporwave",
    category: "digital",
    gradient: "from-fuchsia-500 via-cyan-400 to-indigo-900",
    promptTemplate:
      "vaporwave aesthetic, neon pink and cyan gradients, retro grid horizon, chrome statues, 80s digital nostalgia, high-resolution wallpaper",
  },
  {
    id: "botanical-illustration",
    label: "Botanical Illustration",
    category: "nature",
    gradient: "from-lime-300 via-emerald-500 to-teal-800",
    promptTemplate:
      "vintage botanical illustration, precise ink linework, watercolor washes, herbarium plate composition, muted natural palette, high-resolution wallpaper",
  },
  {
    id: "chinese-ink",
    label: "Chinese Ink Painting",
    category: "painting",
    gradient: "from-stone-200 via-slate-500 to-slate-950",
    promptTemplate:
      "Chinese ink painting, flowing brushwork, misty mountains and water, elegant negative space, subtle ink washes on rice paper, poetic atmosphere, high-resolution wallpaper",
  },
  {
    id: "3d-cartoon",
    label: "3D Cartoon",
    category: "digital",
    gradient: "from-orange-300 via-pink-500 to-violet-800",
    promptTemplate:
      "stylized 3D cartoon art, appealing rounded character shapes, soft global illumination, playful proportions, clean studio render, expressive color, high-resolution wallpaper",
  },
  {
    id: "starry-galaxy",
    label: "Starry Galaxy",
    category: "nature",
    image: "/images/styles/starry-galaxy.jpg",
    gradient: "from-indigo-700 via-blue-900 to-black",
    promptTemplate:
      "deep-space astrophotography, luminous nebula gas and dust lanes, dense star fields, cosmic scale, rich blue-green palette, high-resolution wallpaper",
  },
  {
    id: "mountain-lake",
    label: "Mountain Lake",
    category: "nature",
    image: "/images/styles/mountain-lake.jpg",
    gradient: "from-slate-500 via-cyan-900 to-slate-950",
    promptTemplate:
      "photorealistic mountain lake at blue hour, mirror-calm reflection, dark forest ridge, moon glow, crisp air, layered atmospheric depth, high-resolution wallpaper",
  },
  {
    id: "deep-ocean",
    label: "Deep Ocean",
    category: "nature",
    image: "/images/styles/deep-ocean.jpg",
    gradient: "from-cyan-700 via-blue-950 to-black",
    promptTemplate:
      "deep-sea photography, luminous jellyfish with translucent tentacles, drifting particles, soft volumetric light, abyssal blue water, high-resolution wallpaper",
  },
  {
    id: "aurora-nights",
    label: "Aurora Nights",
    category: "nature",
    image: "/images/styles/aurora-nights.jpg",
    gradient: "from-emerald-500 via-teal-800 to-indigo-950",
    promptTemplate:
      "aurora borealis over a snow-covered arctic landscape, green and violet light curtains, star-filled sky, mirror water, crisp cold atmosphere, high-resolution wallpaper",
  },
  {
    id: "architecture-minimal",
    label: "Architecture Minimal",
    category: "photography",
    image: "/images/styles/architecture-minimal.jpg",
    gradient: "from-stone-200 via-stone-500 to-stone-900",
    promptTemplate:
      "minimalist architecture and interior photography, clean geometric planes, soft daylight, matte surfaces, restrained palette, precise negative space, high-resolution wallpaper",
  },
  {
    id: "macro-nature",
    label: "Macro Nature",
    category: "photography",
    image: "/images/styles/macro-nature.jpg",
    gradient: "from-lime-500 via-emerald-800 to-black",
    promptTemplate:
      "extreme macro nature photography, dew drops on a leaf, translucent highlights, shallow depth of field, fine organic detail, soft natural light, high-resolution wallpaper",
  },
  {
    id: "soft-gradient",
    label: "Soft Gradient",
    category: "abstract",
    image: "/images/styles/soft-gradient.jpg",
    gradient: "from-pink-300 via-violet-500 to-indigo-900",
    promptTemplate:
      "soft gradient abstract wallpaper, layered translucent color fields, gentle glow, subtle film grain, calm minimal composition, high-resolution wallpaper",
  },
  {
    id: "abstract-light",
    label: "Abstract Light",
    category: "digital",
    image: "/images/styles/abstract-light.jpg",
    gradient: "from-fuchsia-500 via-purple-700 to-cyan-800",
    promptTemplate:
      "abstract light art, flowing luminous ribbons on a deep dark background, prismatic color, soft bloom, fine grain, high-resolution wallpaper",
  },
];

/**
 * Public style catalogue.
 *
 * Every style must ship a real preview image so the selector can be used by
 * sight alone. Previews live under /images/styles/ as either a traceable
 * CC0/self-authored JPG (8 styles) or a project-generated WebP derivative
 * (46 styles) — see data/media-rights.json (usage: style-preview).
 *
 * The rights registry is the gate: a style keeps its preview only while the
 * corresponding asset (`style.<id>`) is verified and cleared for public
 * display. A takedown therefore strips the preview automatically, and a new
 * preview only needs to be registered — no code change.
 */
export const WALLPAPER_STYLES: WallStyle[] = RAW_WALLPAPER_STYLES.map(
  (style) => {
    const previewPath = style.image ?? `/images/styles/${style.id}.webp`;
    return isStylePreviewPublic(style.id)
      ? { ...style, image: previewPath }
      : { ...style, image: undefined };
  }
);

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

/**
 * Homepage hero and Studio sample now use the same CC0 photographs recorded
 * in the media rights registry. They are not AI-generated claims.
 */
export const HERO_IMAGE = "/images/wallpapers/nebula-drift.jpg";
export const HERO_IMAGE_SOURCE =
  "Carina Nebula in Hubble Palette · Dylan O'Donnell · CC0";
export const DEMO_SAMPLE_IMAGE = "/images/wallpapers/sakura-dream.jpg";
export const DEMO_SAMPLE_IMAGE_SOURCE =
  "Cherry blossom against blue sky · indah nur indaheart · CC0";

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
  { id: "anime", label: "Anime & Manga", description: "Cinematic anime, shonen, shojo, chibi, mecha and more" },
  { id: "digital", label: "Digital Art", description: "3D renders, pixel art and concept styles" },
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
  anime: "Cinematic anime framing and vibrant cel shading",
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
  "anime-fantasy": "Magical adventure with painterly anime worlds",
  "paper-cut": "Layered paper textures with crisp cut edges",
  "clay-3d": "Soft plasticine shapes and matte studio light",
  "low-poly": "Faceted geometry and flat-shaded minimalism",
  "stained-glass": "Luminous colored panes and leaded outlines",
  "vaporwave": "Neon nostalgia and retro digital sunsets",
  "botanical-illustration": "Precise ink and watercolor plant studies",
  "chinese-ink": "Flowing brushwork, mist and poetic negative space",
  "starry-galaxy": "Deep-space nebula and dense star fields",
  "mountain-lake": "Mirror-calm mountain lake at blue hour",
  "deep-ocean": "Luminous jellyfish in the abyssal dark",
  "aurora-nights": "Green and violet aurora over arctic silence",
  "architecture-minimal": "Quiet geometry in soft daylight",
  "macro-nature": "Dew, veins and translucent macro detail",
  "soft-gradient": "Layered color fields and gentle glow",
  "abstract-light": "Flowing ribbons of prismatic light",
  "3d-cartoon": "Rounded characterful 3D with soft studio light",
};
