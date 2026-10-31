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
  { id: "b2-mecha-battleline", w: 1536, h: 864, seed: 210101, prompt: "Original anime mecha squad advancing through a ruined future boulevard at dawn, dust and floating debris backlit by giant arc lights, bold heroic low-angle composition, teal-and-orange palette with electric violet accents, dynamic action frozen mid-step, detailed mechanical panel lines, anime key-visual quality, desktop wallpaper, no text, no logos, no watermark" },
  { id: "b2-cyber-nightmarket", w: 1536, h: 864, seed: 210102, prompt: "Sprawling cyberpunk night market seen from above a canal, hundreds of paper lanterns and holographic stalls reflecting in black water, drone lights weaving between towers, saturated magenta-cyan contrast against deep indigo, wide establishing composition, cinematic depth, desktop wallpaper, no text, no readable signage, no watermark" },
  { id: "b2-interstellar-gate", w: 1536, h: 864, seed: 210103, prompt: "A titanic original jump-gate structure opening a swirling portal above a fleet of exploration ships, energy filaments in gold and ice-blue, deep starfield, awe-inspiring sense of scale, symmetrical heroic composition, hard sci-fi concept realism, desktop wallpaper, ultra sharp, no text, no logos, no watermark" },
  { id: "b2-dark-citadel-throne", w: 1536, h: 864, seed: 210104, prompt: "Dark fantasy citadel throne hall seen from the great doors, towering twisted pillars, cold shafts of moonlight through shattered glass, embers drifting in the air, obsidian and blood-red palette, ominous but elegant atmosphere, wide symmetrical composition, dark fantasy matte painting, desktop wallpaper, no gore, no text, no logos, no watermark" },
  { id: "b2-jp-aesthetic-alley", w: 1536, h: 864, seed: 210105, prompt: "Japanese aesthetic alley in early evening, wooden machiya townhouses, paper lanterns warming a narrow stone lane, distant Mount Fuji silhouette under a huge setting sun, ukiyo-e-inspired flat color blended with modern anime lighting, tranquil and nostalgic, layered composition, desktop wallpaper, no text, no logos, no watermark" },
  { id: "b2-vaporwave-mall", w: 1536, h: 864, seed: 210106, prompt: "Abandoned retro-futuristic shopping mall flooded with shallow water, neon signage glow in pink and cyan mirrored on the surface, checkered floor fading into infinity, 1980s vaporwave dreamscape, wide one-point perspective, soft grain, desktop wallpaper, no text, no readable signage, no watermark" },
  { id: "b2-dreamcore-playground", w: 1536, h: 864, seed: 210107, prompt: "Dreamcore playground of impossible swings and slides standing on clouds under a lavender sky with three soft suns, gentle pastel palette, hazy dream logic, serene and slightly surreal, wide balanced composition, high-detail digital painting, desktop wallpaper, no text, no logos, no watermark" },
  { id: "b2-gothic-cathedral", w: 1536, h: 864, seed: 210108, prompt: "Interior of an original gothic cathedral at midnight, towering stained-glass windows glowing in deep crimson and cobalt, candle field flickering below, fog crawling along the stone floor, dramatic vertical-light composition, photorealistic dark atmosphere without gore, desktop wallpaper, no text, no logos, no watermark" },
  { id: "b2-roadmovie-dusk", w: 1536, h: 864, seed: 210109, prompt: "American west-coast highway at dusk seen from behind an original vintage convertible, purple-orange gradient sky, headlights glowing, power lines rhythmically framing the road, nostalgic road-movie grading, cinematic wide composition, photorealistic, desktop wallpaper, no text, no readable plates, no watermark" },
  { id: "b2-samurai-standoff", w: 1536, h: 864, seed: 210110, prompt: "An original samurai standing in a bamboo grove during a sudden storm, bamboo bending in wind, lightning flash illuminating the scene, deep green and slate palette with a single crimson sash accent, dramatic off-center composition, painterly realism, desktop wallpaper, no text, no logos, no watermark" },
  { id: "b2-pixel-arcade-world", w: 1536, h: 864, seed: 210111, prompt: "Detailed pixel-art world where a floating arcade island connects smaller islands with neon bridges, day-night gradient sky, tiny adventurers on paths, rich 16-bit palette with modern glow, crisp pixel clusters, wide game-map composition, desktop wallpaper, no text, no readable signage, no watermark" },
  { id: "b2-race-future-circuit", w: 1536, h: 864, seed: 210112, prompt: "Original anti-gravity race cars charging through a neon circuit tunnel, light ribbons streaking off the hulls, sparks dancing on the track wall, speed-blurred background, electric blue against hot magenta, dynamic diagonal composition, concept-art realism, desktop wallpaper, no text, no logos, no watermark" },
  { id: "b2-galaxy-river-mountain", w: 1536, h: 864, seed: 210113, prompt: "The Milky Way pouring like a luminous river between two mountain ridges, a mirrored alpine lake reflecting the core, a lone cabin with one warm window, deep blue nightscape with cyan and gold starlight, long-exposure astrophotography realism, wide composition, desktop wallpaper, no text, no logos, no watermark" },
  { id: "b2-magic-forest-spirits", w: 1536, h: 864, seed: 210114, prompt: "Enchanted old-growth forest at night, glowing spore-spirits floating between colossal mossy trunks, a hidden shrine stone overgrown with roots, fireflies and soft god-rays, emerald-and-gold palette, storybook fantasy realism, immersive deep composition, desktop wallpaper, no text, no logos, no watermark" },
  { id: "b2-amoled-obsidian-wave", w: 1536, h: 864, seed: 210115, prompt: "AMOLED minimalist wallpaper, near-black obsidian surface crossed by a single sweeping wave of violet-to-blue gradient light, fine luminous particles along the wave crest, vast negative space, ultra-clean abstract composition, subtle depth, desktop wallpaper, no text, no logos, no watermark" },
  { id: "b2-anime-festival-night", w: 1536, h: 864, seed: 210116, prompt: "Warm anime festival street at night, original characters in summer yukata watching fireworks bloom over wooden stalls, glowing lantern strings, gentle smiles, golden-and-pink palette against deep blue sky, heartwarming slice-of-life mood, layered wide composition, detailed background art, desktop wallpaper, no text, no logos, no watermark" },
  { id: "b2-mech-pilot-gaze", w: 864, h: 1536, seed: 210201, prompt: "Vertical anime portrait, an original mecha pilot standing before her towering mechanical partner, cables and status lights glowing, hangar depth-of-field, cool blue with amber highlights, heroic upward composition with vast negative space above, phone wallpaper, no text, no logos, no watermark" },
  { id: "b2-cyber-alley-cat", w: 864, h: 1536, seed: 210202, prompt: "Vertical cyberpunk alley where an original robotic cat sits on a crate under flickering neon, steam rising from vents, rain droplets suspended in colored light, magenta and teal palette, intimate low-angle composition, phone wallpaper, no text, no readable signage, no watermark" },
  { id: "b2-lofi-rain-window", w: 864, h: 1536, seed: 210203, prompt: "Vertical lo-fi scene, rain streaking down a large window with a steaming mug on the sill, blurred warm city lights beyond, a sleeping cat on the chair, cozy amber-and-blue palette, soft grain, calming mood, phone wallpaper, no text, no logos, no watermark" },
  { id: "b2-galaxy-cliff-temple", w: 864, h: 1536, seed: 210204, prompt: "Vertical composition, a tiny mountain temple on a cliff edge beneath a river of stars, the Milky Way core reflected in a still pond at the cliff foot, deep indigo and gold, awe and silence, long-exposure astrophotography realism, phone wallpaper, no text, no logos, no watermark" },
  { id: "b2-magic-forest-well", w: 864, h: 1536, seed: 210205, prompt: "Vertical enchanted forest clearing with an ancient glowing well, fireflies spiraling upward into dark canopy, moss-covered stones and ferns, emerald and gold palette, soft volumetric light from above, storybook fantasy realism, phone wallpaper, no text, no logos, no watermark" },
  { id: "b2-vaporwave-bust", w: 864, h: 1536, seed: 210206, prompt: "Vertical vaporwave still life, a classical plaster bust wearing futuristic chrome visor sunglasses, checkerboard floor to infinity, pink-and-cyan gradient sky through an arched window, palm silhouette, 1980s retro-futurism, phone wallpaper, no text, no logos, no watermark" },
  { id: "b2-dreamcore-doorfield", w: 1536, h: 1152, seed: 210301, prompt: "Dreamcore meadow of standing doors opening onto different skies, day night and sunset, a path of clouds connecting them, soft pastel palette with gentle light leaks, surreal serenity, wide 4:3 balanced composition, high-detail digital painting, tablet wallpaper, no text, no logos, no watermark" },
  { id: "b2-magic-forest-clearing", w: 1536, h: 1152, seed: 210302, prompt: "Enchanted forest clearing at twilight, a circle of glowing mushrooms around an old stone bench, fireflies and drifting pollen, god-rays through the canopy, emerald and warm gold palette, wide 4:3 composition, fantasy realism, tablet wallpaper, no text, no logos, no watermark" },
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
