// Generate the regeneration plan CSV for 39 pending wallpapers.
// No AI calls — plan only. Run: node scripts/media/generate-regen-plan.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const webRoot = path.resolve(import.meta.dirname, "..", "..");
const ts = readFileSync(path.join(webRoot, "lib", "wallpapers.ts"), "utf8");
const s = ts.indexOf("const SEEDS"), e = ts.indexOf("] satisfies", s);
const seeds = ts.slice(s, e);
const dimsMatch = ts.slice(
  ts.indexOf("const IMAGE_DIMENSIONS"),
  ts.indexOf("const STYLE_BY_ID")
);

// Parse pending seeds
const blocks = seeds.split("\n  {").slice(1);
const pending = [];
for (const block of blocks) {
  const id = (block.match(/"([a-z0-9-]+)"/) || [])[1];
  if (!id) continue;
  const lic = (block.match(/license: "([a-z-]+)"/) || [])[1] || "review-pending";
  if (lic !== "review-pending") continue;
  pending.push({
    id,
    title: (block.match(/title: "([^"]+)"/) || [])[1] || "",
    styleId: (block.match(/styleId: "([a-z0-9-]+)"/) || [])[1] || "",
    alt: (block.match(/alt: "([^"]+)"/) || [])[1] || "",
  });
}

// Parse dimensions
const dimStart = ts.indexOf("const IMAGE_DIMENSIONS");
const dimEnd = ts.indexOf("};", dimStart);
const dimsBlock = ts.slice(dimStart, dimEnd);
const dims = {};
for (const m of dimsBlock.matchAll(/"([a-z0-9-]+)": \{ width: (\d+), height: (\d+) \}/g)) {
  dims[m[1]] = { width: Number(m[2]), height: Number(m[3]) };
}

// Unique English prompts matching each concept's original alt text
const PROMPTS = {
  "sakura-nights": "Anime illustration of an original schoolgirl in a dark uniform standing beneath a large cherry blossom tree at night, glowing pink petals drifting in the air, soft moonlight filtering through branches, quiet suburban street with warm lamp posts in the background, indigo and rose palette, detailed background art with depth, vertical composition for phone wallpaper, no text, no logos, no watermark",
  "neon-rain": "Cyberpunk cityscape at night, a rain-soaked street reflecting dense blue and violet neon signs, towering skyscrapers with holographic advertisements, a lone figure with an umbrella walking away from the viewer, volumetric fog between buildings, cinematic wide composition, reflective wet asphalt, indigo and electric cyan palette, vertical wallpaper, no text, no readable signs, no watermark",
  "floating-isles": "Epic fantasy landscape with multiple floating islands suspended in a golden-hour sky, cascading waterfalls pouring off their edges into mist below, lush vegetation and ancient stone ruins on each island, dramatic god-rays piercing through clouds, warm amber and emerald palette, wide cinematic composition with immense scale, desktop wallpaper, no text, no logos, no watermark",
  "twilight-peaks": "Serene mountain landscape at twilight, layered peaks fading into blue-purple atmospheric haze, a winding river reflecting the last light, low mist in the valleys, deep indigo and dusty rose gradient sky with the first stars appearing, minimal moody composition, landscape photography style, desktop wallpaper, no text, no logos, no watermark",
  "violet-orb": "Minimalist abstract wallpaper, a single luminous violet sphere floating centered on a pure black background, subtle inner gradient shifting from deep purple at the core to soft lavender at the rim, faint halo bloom, vast negative space, ultra-clean composition, no texture noise, no grain, desktop wallpaper, no text, no logos, no watermark",
  "mirror-desert": "Surreal dreamscape, an enormous full moon rising over a perfectly mirror-like salt desert, a lone standing door frame reflecting in the shallow water, purple and pink gradient sky, minimal composition with vast open space, fine-art quality, desktop wallpaper, no text, no logos, no watermark",
  "nebula-city": "Science-fiction cityscape under a vast violet and blue nebula sky, towering futuristic spires with warm window lights, flying vehicles leaving light trails between buildings, the nebula dominating the upper half of the frame, cinematic depth and scale, vertical composition, desktop wallpaper, no text, no readable signage, no watermark",
  "astral-drift": "An original astronaut in a detailed spacesuit floating weightlessly in a vibrant purple and blue nebula, surrounded by dense star fields and distant galaxies, dramatic side lighting from an unseen star, vertical composition, photorealistic science-fiction illustration, phone wallpaper, no text, no logos, no watermark",
  "liquid-ribbons": "Abstract wallpaper of flowing translucent ribbons in violet, magenta and cyan, undulating across a dark charcoal background like silk in water, soft gradients blending where the ribbons overlap, elegant minimal composition with generous negative space, high-resolution digital art, desktop wallpaper, no text, no logos, no watermark",
  "storm-ridge": "A lone silhouetted figure standing on a rocky ridge under heavy storm clouds, wind-blown coat, dramatic side profile, muted grey and deep slate palette with a single crack of distant lightning illuminating the cloud edges, cinematic wide composition, photorealistic, desktop wallpaper, no text, no logos, no watermark",
  "chrome-orbit": "3D render of an iridescent chrome torus and floating geometric spheres on a deep violet gradient background, reflective surfaces catching purple and silver light, subtle depth of field, clean studio lighting, octane-render quality, centered composition with breathing room, desktop wallpaper, no text, no logos, no watermark",
  "haze-room": "Dreamcore pastel bedroom filled with soft pink haze, a large window revealing clouds instead of a cityscape, furniture slightly oversized and dreamlike, gentle volumetric light from an unseen source, lavender and cream palette, wide composition, soft-focus edges, digital painting, desktop wallpaper, no text, no logos, no watermark",
  "ring-station": "Science-fiction space station with a massive ring structure orbiting a violet gas-giant planet, shuttle docked at a port, intricate greebles and panel details on the hull, the planet's rings casting shadows across the scene, deep space starfield, cinematic wide composition, concept-art realism, desktop wallpaper, no text, no logos, no watermark",
  "dawn-lake": "Mirror-calm alpine lake at dawn, the water so still it perfectly reflects the surrounding pine forest and pastel sky, a thin layer of mist hovering above the surface, golden light breaking over the mountain ridge, landscape photography style, wide composition, desktop wallpaper, no text, no logos, no watermark",
  "graphite-valley": "Detailed pencil sketch of a misty forest valley with a lone deer standing between towering pine trees, fine crosshatching and tonal shading, graphite texture visible on the paper, atmospheric depth achieved through varying line weight, monochrome with subtle warm paper tone, desktop wallpaper, no text, no logos, no watermark",
  "charcoal-sea": "Expressive charcoal drawing of a stormy seascape, bold smudged strokes depicting crashing waves against jagged rocks, dramatic contrast between deep blacks and bright white foam, visible paper texture and finger-smudge details, monochrome with emotional intensity, desktop wallpaper, no text, no logos, no watermark",
  "crane-pine": "Traditional ink wash painting of a red-crowned crane flying over gnarled pine branches, minimal sumi-e brushstrokes, vast empty space representing mist, black ink on aged paper texture with subtle warm undertones, elegant and meditative, desktop wallpaper, no text, no logos, no watermark",
  "bloom-wash": "Watercolor painting of violet mountains fading into a soft pastel sky, blooming wildflowers in the foreground with paint drips and bleeds, translucent washes layering to create depth, delicate and dreamy, cold-press paper texture visible, desktop wallpaper, no text, no logos, no watermark",
  "impasto-night": "Oil painting in impasto style of a swirling starry night over a violet valley, thick visible brushstrokes creating texture and movement, deep blues and purples with touches of gold, inspired by post-impressionist technique, rich color depth, desktop wallpaper, no text, no logos, no watermark",
  "pixel-skyline": "Detailed pixel art of a retro-futuristic city skyline at night, glowing windows in warm yellows and cool cyans, a large moon in a purple gradient sky, stars as individual pixels, visible pixel grid with careful color ramping, wide composition, desktop wallpaper, no text, no readable signs, no watermark",
  "neon-alley": "Cinematic composition of a rain-soaked neon alley, teal and orange color grading, steam rising from vents, reflections on the wet ground doubling the neon signs, a silhouette walking away from the viewer, anamorphic lens flare, film-still quality, desktop wallpaper, no text, no readable signs, no watermark",
  "crimson-keep": "Gothic horror castle under a blood-red moon, twisted spires reaching toward the crimson sky, ravens perched on gargoyles, dead trees in the foreground, thick atmosphere with drifting mist, deep crimson and charcoal palette, ominous without gore, desktop wallpaper, no text, no logos, no watermark",
  "the-drifter": "Supernatural horror atmosphere, a translucent ghostly figure drifting through an abandoned asylum corridor, peeling paint and rusted doors, a single flickering fluorescent light, desaturated green-grey palette with cold blue shadows, unsettling mood without gore, cinematic composition, desktop wallpaper, no text, no logos, no watermark",
  "the-unseen": "Cosmic horror wallpaper, a colossal entity with too many eyes and tendrils barely visible behind a swirling purple nebula, tiny spaceships fleeing in the foreground, scale that defies comprehension, deep violet and black palette with bioluminescent accents, Lovecraftian atmosphere, desktop wallpaper, no text, no logos, no watermark",
  "tape-07": "Analog horror aesthetic, a grainy VHS security camera frame showing a dimly lit institutional hallway, scan lines and chromatic aberration, a distorted figure barely visible at the far end, timestamp in the corner rendered as abstract pixel blocks, desaturated palette, desktop wallpaper, no readable text, no logos, no watermark",
  "wrong-room": "Psychological horror of an endless empty room with impossible non-Euclidean angles, doorways leading to the same room, a single chair in the center, fluorescent lighting casting long shadows, desaturated beige and grey palette, liminal space aesthetic, wide composition, desktop wallpaper, no text, no logos, no watermark",
  "melting-hour": "Nightmare surrealism of a melting staircase in a crimson dreamscape, steps that flow like liquid, clock faces dissolving into the walls, deep red and purple palette with gold accents, inspired by surrealist masters, wide composition, digital painting, desktop wallpaper, no text, no logos, no watermark",
  "cursed-grove": "Dark fantasy wallpaper of cursed stone ruins in a shadowy forest, a creature with glowing amber eyes watching from between the trees, twisted roots gripping the broken walls, emerald and gold palette with deep shadows, atmospheric fantasy realism, desktop wallpaper, no gore, no text, no logos, no watermark",
  "ash-highway": "Post-apocalyptic landscape of a cracked highway swallowed by fog and overgrown vegetation, rusted abandoned cars, a collapsed overpass in the distance, muted grey-green palette with a single shaft of warm light, desolate mood, wide cinematic composition, desktop wallpaper, no text, no logos, no watermark",
  "after-class": "Horror anime atmosphere, a pale girl with long dark hair standing at the end of an empty school corridor, sunset light casting long shadows through the windows, desks askew, deep perspective drawing the eye toward the figure, desaturated warm tones with cold blue shadows, anime illustration, desktop wallpaper, no text, no logos, no watermark",
  "the-circle": "Occult ritual wallpaper, a glowing ritual circle inscribed on a stone crypt floor surrounded by dripping candles, ancient symbols carved into the walls, purple and gold magical energy, smoke curling from a central brazier, dark fantasy atmosphere, desktop wallpaper, no gore, no text, no logos, no watermark",
  "last-train": "Retro 90s anime style, an original girl with shoulder-length hair sitting alone on a dusk train, city lights streaming past the window, warm interior lighting contrasting with the blue evening outside, vintage cel-shading with visible painted backgrounds, nostalgic and contemplative, vertical composition, phone wallpaper, no text, no logos, no watermark",
  "petal-bloom": "Shoujo anime illustration, an original girl surrounded by swirling pastel rose petals and sparkles, soft pink and lavender palette, delicate linework with screentone accents, gentle expressive eyes, romantic dreamy atmosphere, vertical composition, phone wallpaper, no text, no logos, no watermark",
  "ignition": "Shonen anime action, an original hero mid-leap with a blazing orange energy trail, fist forward, dynamic foreshortening, speed lines and impact sparks, determined expression, bold colors against a dark sky, high-energy composition, phone wallpaper, no text, no logos, no watermark",
  "cloud-friends": "Chibi anime wallpaper of cute super-deformed characters sitting on fluffy pastel clouds, tiny wings and halos, soft candy palette of pink mint and cream, rounded shapes and big expressive eyes, kawaii aesthetic, vertical composition, phone wallpaper, no text, no logos, no watermark",
  "rooftop-duel": "Manga-style black-and-white illustration of two original swordsmen dueling on a rooftop at night, dramatic speed lines and screentone shading, wind-blown clothing, dynamic diagonal composition, high-contrast ink work, phone wallpaper, no text, no logos, no watermark",
  "hangar-rain": "Mecha wallpaper of a colossal battle robot standing in a rainy launch hangar, searchlights cutting through the rain, maintenance crew silhouettes for scale, detailed mechanical panels and weathering, cool grey palette with a single orange warning light, vertical composition, phone wallpaper, no text, no logos, no watermark",
  "great-wave": "Ukiyo-e anime fusion, an original kimono girl standing on a cliff beneath a great indigo wave inspired by traditional woodblock prints, Mount Fuji in the background, foam curls rendered in the classic Hokusai style, indigo and coral palette, vertical composition, phone wallpaper, no text, no logos, no watermark",
  "sunset-cafe": "Cozy anime illustration of a countryside cafe at sunset, warm golden light spilling through large windows onto wooden tables, a cat sleeping on a windowsill, rolling hills visible outside, gentle and inviting, vertical composition, phone wallpaper, no text, no logos, no watermark",
};

const HEADER = "id,title,styleId,prompt,aspectRatio,targetResolution,estimatedCost,outputPath,evidenceStatus,reviewStatus";
const rows = [HEADER];

for (const p of pending) {
  const dim = dims[p.id];
  if (!dim) { console.error("no dims for", p.id); continue; }
  const ar = (dim.width / dim.height).toFixed(2);
  const prompt = PROMPTS[p.id] ?? "";
  if (!prompt) { console.error("no prompt for", p.id); continue; }
  const res = `${dim.width}x${dim.height}`;
  rows.push([
    p.id, `"${p.title}"`, p.styleId,
    `"${prompt}"`,
    ar, res, "$0.03",
    `public/images/wallpapers/${p.id}.jpg`,
    "pending-generation", "review-pending",
  ].join(","));
}

mkdirSync(path.join(webRoot, "..", "..", "docs", "media-review"), { recursive: true });
const out = path.join(webRoot, "..", "..", "docs", "media-review", "regeneration-plan.csv");
writeFileSync(out, rows.join("\n") + "\n");
console.log("written:", out, `(${pending.length} entries)`);
console.log("estimated total:", "$" + (pending.length * 0.03).toFixed(2));
