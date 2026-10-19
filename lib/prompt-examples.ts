import type { StyleId } from "./styles";

/**
 * Static prompt examples for the generator's Inspiration section.
 * Purely local data — nothing here calls an AI API. Examples are written as
 * ready-to-use English wallpaper prompts (subject, composition, light,
 * palette) and deliberately avoid text/logos/watermarks, which render poorly.
 */

export interface PromptExample {
  styleId: StyleId;
  text: string;
}

/** Two curated examples per style — see the data-integrity test in use. */
export const STYLE_PROMPT_EXAMPLES: readonly PromptExample[] = [
  { styleId: "anime", text: "Anime schoolgirl on a rooftop under drifting cherry blossoms, golden sunset light, pastel sky, wide cinematic composition" },
  { styleId: "anime", text: "Cozy anime bedroom at night lit by purple neon lamps, rain streaking the window, lo-fi atmosphere, portrait wallpaper" },
  { styleId: "cyberpunk", text: "Rain-soaked cyberpunk alley glowing with violet and cyan holograms, lone figure under an umbrella, cinematic reflections" },
  { styleId: "cyberpunk", text: "Sprawling neon megacity skyline at midnight, magenta fog between skyscrapers, aerial view wallpaper" },
  { styleId: "fantasy", text: "Floating islands linked by glowing bridges above a violet cloud sea, waterfalls falling into mist, epic fantasy wallpaper" },
  { styleId: "fantasy", text: "Ancient forest shrine lit by floating spirit lanterns, mossy stone path, soft blue moonlight, magical scene" },
  { styleId: "nature", text: "Misty mountain range at dawn, layered ridgelines fading into blue haze, warm light on the highest peak" },
  { styleId: "nature", text: "Quiet pine lake mirroring snow-capped peaks at golden hour, glassy water, crisp alpine air" },
  { styleId: "minimalist", text: "Single glowing violet sphere floating over a deep charcoal gradient, generous negative space, minimal design" },
  { styleId: "minimalist", text: "Soft sand dune curves in warm beige light, one thin horizon line, calm minimalist composition" },
  { styleId: "surreal", text: "Giant crescent moon resting on a mirror-flat desert, a lone doorway glowing pink, surreal dreamscape" },
  { styleId: "surreal", text: "Staircase spiraling into a pastel sunset sky filled with slow-moving clouds, surreal fine art scene" },
  { styleId: "abstract", text: "Flowing ribbons of violet, magenta and blue melting into each other, glossy liquid gradients, modern abstract art" },
  { styleId: "abstract", text: "Bold geometric shapes in muted terracotta and slate, soft grain texture, balanced abstract composition" },
  { styleId: "dark", text: "Foggy pine forest under a pale winter moon, deep shadows and silver light, moody dark wallpaper" },
  { styleId: "dark", text: "Storm clouds over a black volcanic beach, a single shaft of cold light, dramatic minimal scene" },
  { styleId: "3d-art", text: "Glossy violet 3D shapes floating over a soft studio backdrop, subsurface glow, playful polished render" },
  { styleId: "3d-art", text: "Isometric futuristic room with glowing furniture and tiny plants, clean 3D render, pastel palette" },
  { styleId: "dreamcore", text: "Endless pastel hallway with glowing doors and hazy pink light, nostalgic dreamlike atmosphere" },
  { styleId: "dreamcore", text: "Empty playground under a cotton-candy sky with two suns, soft focus haze, wistful dream scene" },
  { styleId: "sci-fi", text: "Colossal ring station orbiting a violet gas giant, a tiny shuttle for scale, volumetric light, epic sci-fi art" },
  { styleId: "sci-fi", text: "Sleek starship gliding over an ice planet at sunrise, long shadows, cinematic concept art" },
  { styleId: "photography", text: "Close-up of ocean foam swirling on dark sand, natural textures and cool tones, fine art photography" },
  { styleId: "photography", text: "Sunlit canyon walls glowing amber and rust, deep natural shadows, high dynamic range landscape photo" },
  { styleId: "pencil-sketch", text: "Detailed pencil sketch of a lighthouse on a cliff, stormy hatched sky, graphite texture, monochrome drawing" },
  { styleId: "pencil-sketch", text: "Hand-drawn mountain valley with soft graphite shading and paper grain, black and white fine art sketch" },
  { styleId: "charcoal-drawing", text: "Expressive charcoal drawing of a lone wolf in drifting snow, bold smudged strokes, textured paper" },
  { styleId: "charcoal-drawing", text: "Charcoal drawing of an old oak tree in fog, heavy shadows and soft grey washes, moody fine art sketch" },
  { styleId: "ink-drawing", text: "Sumi-e ink painting of misty bamboo groves, confident black strokes on rice paper, minimal oriental art" },
  { styleId: "ink-drawing", text: "Cross-hatched ink cityscape at dusk, stippled streetlights, high-contrast monochrome pen drawing" },
  { styleId: "watercolor", text: "Soft watercolor wash of lavender fields at dawn, blooming pigments and white paper texture, gentle art" },
  { styleId: "watercolor", text: "Watercolor koi pond with translucent violet and teal swirls, delicate brushwork, airy composition" },
  { styleId: "oil-painting", text: "Classical oil painting of a stormy sea crashing on dark rocks, impasto brushwork, dramatic chiaroscuro light" },
  { styleId: "oil-painting", text: "Oil-painted autumn forest glowing in amber light, thick layered pigments, canvas texture, fine art" },
  { styleId: "pixel-art", text: "Retro 16-bit pixel art of a lighthouse island at night, glowing windows, dithered ocean waves, cozy game scene" },
  { styleId: "pixel-art", text: "Pixel art neon city street in the rain, cyan and magenta signage, chunky retro dithering, 8-bit wallpaper" },
  { styleId: "cinematic", text: "Cinematic still of a lone car on a desert highway at dusk, teal and orange grade, anamorphic lens flare" },
  { styleId: "cinematic", text: "Rainy neon diner window at night, shallow depth of field, subtle film grain, moody cinematic color grade" },
  { styleId: "gothic-horror", text: "Moonlit gothic castle with towering spires and drifting fog, ravens circling a blood-red sky, black and crimson palette" },
  { styleId: "gothic-horror", text: "Candlelit cathedral interior with rose windows and long shadows, gothic arches fading into darkness, ominous elegance" },
  { styleId: "supernatural-horror", text: "Ghostly figure drifting through an abandoned hospital corridor, flickering pale light, floating dust, unsettling stillness" },
  { styleId: "supernatural-horror", text: "Derelict mansion staircase lit by a single cold glow, a door slowly opening into darkness, eerie supernatural mood" },
  { styleId: "cosmic-horror", text: "Colossal entity with too many eyes looming behind a violet nebula, fleeing ships for scale, deep space dread" },
  { styleId: "cosmic-horror", text: "Sunken non-euclidean monolith rising from a black ocean under a wrong-colored sky, eldritch cosmic scale" },
  { styleId: "analog-horror", text: "Grainy VHS security frame of an empty parking lot with a distorted figure at the edge, scanlines and timestamp" },
  { styleId: "analog-horror", text: "CRT television wall in a dark room showing static and a smeared face, tracking distortion, retro analog dread" },
  { styleId: "psychological-horror", text: "Endless empty room with doors at impossible angles, buzzing fluorescent light, oppressive liminal silence" },
  { styleId: "psychological-horror", text: "Identical doorways repeating down a warped corridor, one slightly ajar, muted tones and warped perspective" },
  { styleId: "nightmare-surrealism", text: "Melting staircase coiling through a crimson dreamscape, floating clocks and watchful eyes, twisted dream logic" },
  { styleId: "nightmare-surrealism", text: "Faceless figures standing in a field of tilted doors under a bruised sky, dark surrealist nightmare" },
  { styleId: "dark-fantasy", text: "Cursed ruins wrapped in thorns deep in a shadowy forest, a glowing-eyed creature watching from the mist" },
  { styleId: "dark-fantasy", text: "Bone-strewn shrine lit by sickly green witchlight, hooded figures circling an ancient stone, ominous dark fantasy" },
  { styleId: "post-apocalyptic", text: "Collapsed skyscrapers swallowed by thick fog, rusted cars on a cracked highway, falling ash" },
  { styleId: "post-apocalyptic", text: "Overgrown subway station flooded with murky water, distant emergency lights still blinking, desolate end of days" },
  { styleId: "horror-anime", text: "Pale girl with long black hair at the end of a dark school corridor, shadows swallowing the hallway" },
  { styleId: "horror-anime", text: "Abandoned classroom at midnight with a single chair turned to face the window, anime horror stillness" },
  { styleId: "occult-ritual", text: "Glowing arcane circle ringed by black candles in a stone crypt, drifting smoke, sigils on cracked walls" },
  { styleId: "occult-ritual", text: "Ancient ritual chamber with a levitating grimoire, candlelight against deep shadow, floating embers" },
  { styleId: "retro-cel", text: "Girl on a dusk train watching neon signs blur past, vintage cel shading, warm nostalgic film grain" },
  { styleId: "retro-cel", text: "Rooftop scene under a retro orange sunset, classic 90s anime palette, hand-painted sky" },
  { styleId: "shoujo", text: "Girl with flowing hair among pastel rose petals and sparkles, soft pink and lavender dream" },
  { styleId: "shoujo", text: "Two silhouettes almost touching hands under cherry blossoms, sparkling shoujo glow, delicate florals" },
  { styleId: "shonen", text: "Young hero mid-leap with a blazing energy trail, radiating speed lines, dramatic cloud-piercing sky" },
  { styleId: "shonen", text: "Rival showdown on a cliff at sunrise, bold saturated colors, crackling energy and speed lines" },
  { styleId: "chibi", text: "Adorable chibi characters piled on a pastel cloud with kawaii stars and hearts" },
  { styleId: "chibi", text: "Chibi cafe scene with tiny aprons and giant sweets, soft pastel palette, playful mood" },
  { styleId: "manga", text: "Black-and-white rooftop duel with radial speed lines and screentone shading, bold ink panel art" },
  { styleId: "manga", text: "Quiet manga panel of a girl reading by a rain-streaked window, delicate hatching, monochrome mood" },
  { styleId: "mecha", text: "Colossal battle robot in a rainy launch hangar, panel-lined armor with cyan glow, epic scale" },
  { styleId: "mecha", text: "Mecha squadron flying over a sunset ocean, contrails crossing, detailed mechanical silhouettes" },
  { styleId: "ukiyo-e-anime", text: "Kimono girl beneath a great indigo wave with mount fuji beyond, woodblock texture, flat elegant planes" },
  { styleId: "ukiyo-e-anime", text: "Fox spirit crossing a red bridge under a full moon, ukiyo-e clouds and wave motifs, traditional palette" },
  { styleId: "cozy-anime", text: "Quiet countryside cafe with plants and warm lantern light at sunset, gentle slice-of-life peace" },
  { styleId: "cozy-anime", text: "Rainy window seat with a cat, tea and sketchbooks, soft healing colors, nostalgic cozy atmosphere" },
];

/**
 * General-purpose inspiration shown when no style is selected. Covers a few
 * classic wallpaper directions without steering the user toward a style.
 */
export const GENERAL_PROMPT_EXAMPLES: readonly string[] = [
  "Cinematic wide landscape of rolling hills under a dramatic sunset sky, layered light and haze",
  "Minimalist geometric composition of overlapping circles and lines in soft violet tones, calm and balanced",
  "Dreamlike fantasy world with drifting islands, soft glowing clouds and gentle pastel light",
  "Peaceful nature scene of a quiet forest lake at sunrise, soft mist and golden reflections",
  "Futuristic cityscape with sleek towers and glowing transit lines under a deep blue night sky",
  "Soft abstract gradient wallpaper blending violet, magenta and deep blue into a smooth glow, subtle grain",
];

/** The two curated examples for a style, in stable order. */
export function getExamplesForStyle(styleId: StyleId): readonly string[] {
  return STYLE_PROMPT_EXAMPLES.filter(
    (example) => example.styleId === styleId
  ).map((example) => example.text);
}

/**
 * Picks one random example: from the given style when available, otherwise
 * from the general pool. Only local data — never an API call.
 */
export function getRandomExample(styleId: StyleId | null): string {
  const styleExamples = styleId ? getExamplesForStyle(styleId) : [];
  const pool = styleExamples.length > 0 ? styleExamples : GENERAL_PROMPT_EXAMPLES;
  return pool[Math.floor(Math.random() * pool.length)];
}