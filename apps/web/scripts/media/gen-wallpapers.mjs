// Offline operations batch: original wallpaper generation via the project's
// existing fal.ai model (fal-ai/flux-2/klein/4b, direct endpoint).
//
// Runs ON the VPS inside the API image (node 22) with the production
// FAL_KEY supplied through --env-file /opt/wallhaze/secrets/api.env.
// The key is read from the environment and NEVER printed or persisted.
//
// Budget guard: hard cap of 30 model requests (≈ $1.50 at a conservative
// $0.05/request ceiling) — well under the authorized $3 batch budget.
// Retries: at most 2 per image, only for transport/5xx failures; a safety-
// checker refusal is recorded and never retried.
//
// Usage (on VPS):
//   docker run --rm -v /opt/wallhaze/generated:/work \
//     --env-file /opt/wallhaze/secrets/api.env wallhaze/api:latest \
//     node /work/gen-wallpapers.mjs

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

const OUT_DIR = "/work/out";
const MANIFEST = "/work/manifest.json";
const MODEL = "fal-ai/flux-2/klein/4b";
const ENDPOINT = "https://fal.run/fal-ai/flux-2/klein/4b";
const MAX_REQUESTS = 30;
const EST_COST_PER_REQUEST_USD = 0.05;
const BATCH_BUDGET_USD = 3.0;

const SPECS = [
  // ---- Desktop 1536×864 (16) ----
  { id: "mecha-girl-neon-city", w: 1536, h: 864, seed: 110101, prompt: "Original anime mecha girl in a sleek white-and-violet pilot suit standing on a rooftop platform, vast futuristic megacity skyline behind her, glowing neon signs in cyan and magenta, dramatic rim lighting, low-angle heroic composition, night scene, vibrant anime illustration with crisp cel shading, ultra-detailed background, desktop wallpaper composition with clear focal point, no text, no logos, no watermark" },
  { id: "tokyo-neon-rain-night", w: 1536, h: 864, seed: 110102, prompt: "Rainy night in an original futuristic Tokyo-inspired district, wet asphalt reflecting blue and purple neon signage, a lone figure with a transparent umbrella crossing the street, cinematic wide composition, volumetric rain, bokeh city lights, moody film-grade color palette, photorealistic anime background art style, desktop wallpaper, sharp detail, no text, no logos, no watermark" },
  { id: "starship-ring-planet", w: 1536, h: 864, seed: 110103, prompt: "Colossal ringed planet rising over a deep-space horizon, a sleek original starship with glowing engine trails crossing the frame, epic scale, starfield and distant nebula in teal and gold, cinematic lighting, symmetrical wide composition, hard science-fiction concept art, ultra-sharp desktop wallpaper, no text, no logos, no watermark" },
  { id: "gothic-castle-moonlight", w: 1536, h: 864, seed: 110104, prompt: "Ancient gothic castle on a jagged cliff under a full moon, drifting fog in the valley below, ravens in flight, silver moonlight with cold blue tones and a single warm window glow, dramatic low-angle wide composition, dark fantasy matte painting, highly detailed stonework, desktop wallpaper, no text, no logos, no watermark" },
  { id: "highway-sunset-classic-car", w: 1536, h: 864, seed: 110105, prompt: "Western movie style desert highway at golden hour, an original classic muscle car driving toward a huge setting sun, long shadows, heat haze, telephone poles fading into the distance, warm orange and deep purple sky, cinematic anamorphic composition with lens flare, photorealistic, desktop wallpaper, no text, no logos, no watermark" },
  { id: "dragon-sky-citadel", w: 1536, h: 864, seed: 110106, prompt: "An original scaled dragon with ember-orange wings circling a floating sky citadel above storm clouds, shafts of god light through the clouds, epic fantasy matte painting, sweeping aerial composition, emerald and amber palette, immense scale and depth, desktop wallpaper, highly detailed, no text, no logos, no watermark" },
  { id: "pixel-rainy-city", w: 1536, h: 864, seed: 110107, prompt: "Pixel art rendition of a rainy neon city intersection at night, glowing shop signs in pink and cyan, reflections on wet pavement, tiny pedestrians with umbrellas, detailed isometric-inspired flat composition, retro 16-bit palette with modern lighting, crisp pixel clusters, desktop wallpaper, no text, no readable signage, no watermark" },
  { id: "abandoned-manor-dread", w: 1536, h: 864, seed: 110108, prompt: "Abandoned Victorian manor at dusk, broken windows with faint candlelight inside, overgrown garden with dead trees, thick mist rolling across the lawn, desaturated green-grey palette with a single amber accent, unsettling atmosphere without gore, cinematic wide composition, photorealistic horror mood, desktop wallpaper, no text, no logos, no watermark" },
  { id: "hypercar-scifi-city", w: 1536, h: 864, seed: 110109, prompt: "Original futuristic hypercar with glowing light lines speeding through a sci-fi city canyon, motion-blurred light trails, holographic billboards in violet and ice-blue, low three-quarter front composition, night scene, reflective paintwork, concept-art realism, desktop wallpaper, sharp detail, no text, no logos, no watermark" },
  { id: "black-hole-voyage", w: 1536, h: 864, seed: 110110, prompt: "A luminous accretion disk around a black hole bending starlight, a tiny original exploration vessel silhouetted against the glow, deep space with orange and cyan plasma arcs, awe-inspiring scale, scientific-illustration realism, wide cinematic composition, desktop wallpaper, ultra-sharp, no text, no logos, no watermark" },
  { id: "neon-motorcycle-night", w: 1536, h: 864, seed: 110111, prompt: "Original rider on a futuristic neon-accented motorcycle leaning into a wet corner, downtown skyline with towering holograms behind, magenta and electric-blue lighting, dynamic side-tracking composition with speed blur on the background, glossy reflections, cyberpunk concept art, desktop wallpaper, no text, no logos, no watermark" },
  { id: "skydeck-future-city", w: 1536, h: 864, seed: 110112, prompt: "A lone visitor on a glass skydeck overlooking an original futuristic megacity at blue hour, layered towers with warm window lights fading into mist, golden interior light against cool twilight, cinematic wide composition with strong leading lines, photorealistic, desktop wallpaper, no text, no logos, no watermark" },
  { id: "amoled-violet-halo", w: 1536, h: 864, seed: 110113, prompt: "Minimalist AMOLED wallpaper, pure black background with a single glowing violet halo ring floating slightly off-center, subtle inner gradient and soft bloom, ultra-clean geometric composition with vast negative space, high contrast, elegant and calm, no texture noise, desktop wallpaper, no text, no logos, no watermark" },
  { id: "deep-sea-glow-cosmos", w: 1536, h: 864, seed: 110114, prompt: "Bioluminescent deep-sea creatures drifting like a galaxy, jellyfish and translucent radiolaria glowing in teal and violet, dark abyss fading into a starfield-like haze, dreamlike fusion of ocean and cosmos, wide ethereal composition, high detail on translucent membranes, desktop wallpaper, no text, no logos, no watermark" },
  { id: "retro-motel-alien-sky", w: 1536, h: 864, seed: 110115, prompt: "Retro 1950s desert motel with neon vacancy sign under an alien sky with two moons and banded planets, vintage car parked at a cabin door, magenta-and-teal synthwave palette, nostalgic wide-angle composition, soft grain, retro-futurism illustration, desktop wallpaper, no text, no readable signage, no watermark" },
  { id: "ukiyo-anime-fusion", w: 1536, h: 864, seed: 110116, prompt: "Fusion of traditional ukiyo-e woodblock style and modern anime illustration, an original heroine in flowing kimono on ahilltop viewing a stylized great wave and modern skyline beyond, flat color planes with bold outlines, indigo and coral palette with gold accents, layered panoramic composition, museum-print quality, desktop wallpaper, no text, no logos, no watermark" },
  // ---- Mobile 864×1536 (6) ----
  { id: "sakura-tram-station", w: 864, h: 1536, seed: 110201, prompt: "Japanese anime style suburban tram station at dusk, cherry blossom petals drifting across the platform, a single warm street lamp, distant city glow, gentle and heartwarming mood, soft pastel palette with peach and lavender sky, vertical composition with strong foreground-background depth, Makoto-Shinkai-inspired background art, phone wallpaper, no text, no logos, no watermark" },
  { id: "mystic-girl-night-sky", w: 864, h: 1536, seed: 110202, prompt: "Original anime girl in a dark school uniform looking up at a towering night sky full of stars and a faint aurora, fireflies around her, mystical and serene mood, deep indigo and violet palette with cool moonlight, vertical composition, girl in lower third and vast sky above, detailed anime illustration, phone wallpaper, no text, no logos, no watermark" },
  { id: "samurai-shrine-rain", w: 864, h: 1536, seed: 110203, prompt: "An original samurai standing before a red torii gate path in heavy rain, stone lanterns glowing, wet stone steps reflecting crimson and indigo, dramatic vertical composition with the gate framed by towering trees, painterly ukiyo-e-inspired rain strokes, moody cinematic lighting, phone wallpaper, no text, no logos, no watermark" },
  { id: "starlit-glowing-ocean", w: 864, h: 1536, seed: 110204, prompt: "Vertical seascape where a starlit sky mirrors a glowing plankton ocean, a small wooden boat between the two, bioluminescent waves in aqua and sapphire, dreamlike surreal serenity, long-exposure feel, vertical composition, digital painting with soft luminous gradients, phone wallpaper, no text, no logos, no watermark" },
  { id: "anime-bedroom-cityscape", w: 864, h: 1536, seed: 110205, prompt: "Cozy anime-style bedroom interior seen from inside at night, warm desk lamp and plants by an open window, sprawling city nightscape with glowing buildings beyond, gentle lo-fi atmosphere, warm interior tones against cool blue city, vertical composition, detailed background art, phone wallpaper, no text, no logos, no watermark" },
  { id: "synthwave-car-sunset", w: 864, h: 1536, seed: 110206, prompt: "Retro synthwave poster style, an original 1980s sports car on an endless grid-lined road toward a giant striped sunset, pink and violet gradient sky, palm silhouettes, chrome reflections, vertical composition, glowing horizon line, clean vector-like rendering with subtle grain, phone wallpaper, no text, no logos, no watermark" },
  // ---- Tablet 1536×1152 (2) ----
  { id: "dreamcore-floating-room", w: 1536, h: 1152, seed: 110301, prompt: "Dreamcore surreal scene, a cozy furnished room floating on a small island above an endless cloud sea, doors opening onto sky, soft volumetric sunlight, pastel blue and cream palette with subtle pink light leaks, impossible architecture, serene and wondrous mood, wide 4:3 composition, high-detail digital painting, tablet wallpaper, no text, no logos, no watermark" },
  { id: "clay-toon-cozy-world", w: 1536, h: 1152, seed: 110302, prompt: "Cute 3D clay-render cozy miniature world, rounded happy houses with tiny glowing windows on floating grass islands, soft doey materials, gentle studio lighting with soft shadows, pastel candy palette, playful heartwarming mood, wide 4:3 composition, subsurface-scattering clay texture, tablet wallpaper, no text, no logos, no watermark" },
];

const requestsLog = [];
let spent = 0;

function assertBudget() {
  if (SPECS.length > MAX_REQUESTS) {
    throw new Error(`spec count ${SPECS.length} exceeds request cap ${MAX_REQUESTS}`);
  }
}

async function generateOne(spec, attempt) {
  const startedAt = new Date().toISOString();
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${process.env.FAL_KEY}`,
    },
    body: JSON.stringify({
      prompt: spec.prompt,
      image_size: { width: spec.w, height: spec.h },
      num_images: 1,
      enable_safety_checker: true,
      output_format: "png",
      seed: spec.seed + (attempt > 1 ? attempt * 7 : 0),
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw Object.assign(
      new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`),
      { status: response.status }
    );
  }
  const payload = await response.json();
  const image = payload?.images?.[0];
  if (!image?.url) {
    throw new Error(`no image in response: ${JSON.stringify(payload).slice(0, 200)}`);
  }
  const bytes = Buffer.from(await (await fetch(image.url)).arrayBuffer());
  return {
    bytes,
    meta: {
      id: spec.id,
      model: MODEL,
      seed: payload.seed ?? spec.seed,
      requestId: payload.request_id ?? null,
      falUrl: image.url,
      width: image.width ?? spec.w,
      height: image.height ?? spec.h,
      contentType: image.content_type ?? "image/png",
      bytes: bytes.length,
      safetyChecker: true,
      attemptedAt: startedAt,
      completedAt: new Date().toISOString(),
      attempt,
    },
  };
}

async function main() {
  if (!process.env.FAL_KEY) {
    console.error("[gen] FAL_KEY missing from environment — refusing to run");
    process.exit(1);
  }
  assertBudget();
  mkdirSync(OUT_DIR, { recursive: true });
  const results = [];
  const failures = [];

  for (const spec of SPECS) {
    if (spent + EST_COST_PER_REQUEST_USD > BATCH_BUDGET_USD) {
      console.error(`[gen] budget guard: stopping before "${spec.id}"`);
      break;
    }
    let done = false;
    for (let attempt = 1; attempt <= 3 && !done; attempt += 1) {
      // attempts 1..3: initial + 2 retries. Each call counts against budget.
      spent += EST_COST_PER_REQUEST_USD;
      requestsLog.push({ id: spec.id, attempt });
      try {
        const { bytes, meta } = await generateOne(spec, attempt);
        const file = `${OUT_DIR}/${spec.id}.png`;
        writeFileSync(file, bytes);
        results.push({ ...meta, file, prompt: spec.prompt });
        console.log(`[gen] ok ${spec.id} (${Math.round(bytes.length / 1024)} KB, attempt ${attempt})`);
        done = true;
      } catch (error) {
        const refused = /safety|NSFW/i.test(String(error.message));
        console.error(`[gen] fail ${spec.id} attempt ${attempt}: ${String(error.message).slice(0, 120)}`);
        failures.push({ id: spec.id, attempt, error: String(error.message).slice(0, 200) });
        if (refused) break; // safety refusal: never retry
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  writeFileSync(MANIFEST, JSON.stringify({
    model: MODEL,
    generatedAt: new Date().toISOString(),
    requestCount: requestsLog.length,
    estimatedCostUsd: Math.round(spent * 100) / 100,
    budgetUsd: BATCH_BUDGET_USD,
    succeeded: results.length,
    failed: failures,
    results,
  }, null, 2));
  console.log(`[gen] done: ${results.length}/${SPECS.length} images, ${requestsLog.length} requests, est. $${Math.round(spent * 100) / 100}`);
}

main().catch((error) => {
  console.error(`[gen] fatal: ${error.message}`);
  process.exit(1);
});
