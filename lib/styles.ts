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
  | "photography";

export interface WallStyle {
  id: StyleId;
  label: string;
  /** Sample artwork URL — only the popular styles ship with images. */
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
    image: wallImage(
      "surreal dreamscape wallpaper, giant glowing moon over a mirror like desert with a lone standing door, purple and pink palette, imaginative fine art",
      PORTRAIT
    ),
    gradient: "from-pink-500 via-violet-800 to-slate-950",
    promptTemplate:
      "surreal dreamscape, imaginative composition, dreamlike atmosphere, fine art quality, high-resolution wallpaper, sharp detail",
  },
  { id: "abstract", label: "Abstract", gradient: "from-fuchsia-500 via-violet-700 to-indigo-950", promptTemplate: "abstract art, bold shapes, fluid color gradients, modern composition, high-resolution wallpaper" },
  { id: "dark", label: "Dark", gradient: "from-slate-700 via-slate-900 to-black", promptTemplate: "dark moody aesthetic, deep shadows, low-key lighting, mysterious atmosphere, high-resolution wallpaper" },
  { id: "3d-art", label: "3D Art", gradient: "from-blue-500 via-violet-800 to-slate-950", promptTemplate: "polished 3D render, soft studio lighting, glossy materials, high detail, high-resolution wallpaper" },
  { id: "dreamcore", label: "Dreamcore", gradient: "from-pink-400 via-fuchsia-700 to-indigo-900", promptTemplate: "dreamcore aesthetic, ethereal pastel haze, nostalgic surreal atmosphere, soft focus, high-resolution wallpaper" },
  { id: "sci-fi", label: "Sci-Fi", gradient: "from-sky-500 via-blue-800 to-slate-950", promptTemplate: "sci-fi concept art, futuristic technology, epic scale, volumetric lighting, high-resolution wallpaper, sharp detail" },
  { id: "photography", label: "Photography", gradient: "from-stone-500 via-stone-800 to-black", promptTemplate: "professional photography, sharp focus, natural bokeh, high dynamic range, high-resolution wallpaper" },
];

/** The six styles showcased in the gallery section. */
export const POPULAR_STYLES = WALLPAPER_STYLES.slice(0, 6);

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
