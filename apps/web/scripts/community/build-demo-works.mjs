#!/usr/bin/env node
/**
 * Assembles data/community/demo-works.json from the generation ledger and the
 * demo plan metadata. Read-only w.r.t. media: it never touches paid calls.
 *
 * Usage: node scripts/community/build-demo-works.mjs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { probeMp4 } from "./mp4.mjs";

const ROOT = process.cwd();
const LEDGERS = path.join(ROOT, "private-media", "community", "fal-ledgers");
const PLAN = JSON.parse(readFileSync(path.join(ROOT, "scripts", "community", "demo-plan.json"), "utf8"));
const TARGET = path.join(ROOT, "data", "community", "demo-works.json");
const PRIVATE_DEMO = path.join(ROOT, "private-media", "community", "demo-media");

/** Per-slug editorial metadata: titles/descriptions read like real art. */
const WORK_META = {
  "demo-001": {
    title: "Lanterns Under a Spring Galaxy",
    description:
      "A kimono-clad figure waits beneath blooming cherry trees as paper lanterns glow against a starry spring night. Painted for phone lock screens with calm sky space at the top.",
    styleId: "cinematic",
    sourceType: "demo-local-self",
    allowDownload: true,
    downloadScope: "self-authored",
    downloadScopeNote: "Demo sample — free to download for personal device use.",
    featured: true,
    themeId: null,
  },
  "demo-002": {
    title: "Neon Monsoon",
    description:
      "A lone umbrella drifts down a rain-drenched street of holographic signs. Magenta and cyan reflections do the storytelling on this vertical cyberpunk piece.",
    styleId: "cyberpunk",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-003": {
    title: "Medusa in the Deep",
    description:
      "A bioluminescent jellyfish hangs in the abyss, tentacles trailing teal light through drifting marine snow. Best viewed on an OLED phone screen.",
    styleId: "deep-ocean",
    sourceType: "demo-local-self",
    allowDownload: true,
    downloadScope: "self-authored",
    downloadScopeNote: "Demo sample — free to download for personal device use.",
    featured: false,
    themeId: null,
  },
  "demo-004": {
    title: "Pastel Wind",
    description:
      "Poppy petals catch the last pastel light of a summer evening. Soft bokeh keeps the mood romantic without hiding the flower detail.",
    styleId: "photography",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-005": {
    title: "Aurora Mirror",
    description:
      "The northern lights fold into a still mountain lake below a pine forest. Photoreal night photography look, tuned for tall phone screens.",
    styleId: "aurora-nights",
    sourceType: "demo-local-self",
    allowDownload: true,
    downloadScope: "self-authored",
    downloadScopeNote: "Demo sample — free to download for personal device use.",
    featured: false,
    themeId: null,
  },
  "demo-006": {
    title: "Pavilion in the Mist",
    description:
      "An ink-wash valley with a quiet riverside pavilion. Generous negative space leaves room for widgets and the clock on your home screen.",
    styleId: "chinese-ink",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-022": {
    title: "Lanterns Under a Spring Galaxy (Tall)",
    description:
      "The spring-night kimono scene reframed for true 9:16 lock screens: cherry lanterns below, the Milky Way filling the tall sky.",
    styleId: "cinematic",
    sourceType: "demo-local-self",
    allowDownload: true,
    downloadScope: "self-authored",
    downloadScopeNote: "Demo sample — free to download for personal device use.",
    featured: false,
    themeId: null,
  },
  "demo-023": {
    title: "Neon Monsoon (Tall)",
    description:
      "The rain-soaked neon street stretched taller for phone lock screens — reflections below, holograms towering above.",
    styleId: "cyberpunk",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-024": {
    title: "Medusa in the Deep (Tall)",
    description:
      "The bioluminescent jellyfish recomposed for a taller frame, more abyss above and below the glow.",
    styleId: "deep-ocean",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-025": {
    title: "Pastel Wind (Tall)",
    description:
      "The pastel poppy meadow extended skyward for true 9:16 phone screens, bokeh drifting into the sunset.",
    styleId: "photography",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-026": {
    title: "Aurora Mirror (Tall)",
    description:
      "A taller take on the aurora mirror lake — more starfield, more reflection, tuned for phone lock screens.",
    styleId: "aurora-nights",
    sourceType: "demo-local-self",
    allowDownload: true,
    downloadScope: "self-authored",
    downloadScopeNote: "Demo sample — free to download for personal device use.",
    featured: false,
    themeId: null,
  },
  "demo-027": {
    title: "Pavilion in the Mist (Tall)",
    description:
      "The ink-wash pavilion scene stretched vertically: mist layers rise, negative space opens at the top for the clock.",
    styleId: "chinese-ink",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-007": {
    title: "The Baker's Afternoon",
    description:
      "A countryside bakery winds down while the cat claims the warm crate. Slice-of-life background art with a gentle golden glow, sized for tablets.",
    styleId: "cozy-anime",
    sourceType: "demo-local-self",
    allowDownload: true,
    downloadScope: "self-authored",
    downloadScopeNote: "Demo sample — free to download for personal device use.",
    featured: true,
    themeId: null,
  },
  "demo-008": {
    title: "Firefly Path",
    description:
      "Fireflies light a mossy trail through an ancient forest toward a crystal stream. Painterly fantasy with volumetric canopy light.",
    styleId: "anime-fantasy",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-009": {
    title: "Lavender Morning",
    description:
      "Watercolor lavender rows dissolve into morning mist behind a distant spire. Translucent washes and visible paper grain keep it airy on tablets.",
    styleId: "watercolor",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-010": {
    title: "Cloud Sea Fisherman",
    description:
      "Karst towers rise from a rolling cloud sea as a lone fisherman drifts below. A single red sun punctuates the monochrome ink layers.",
    styleId: "chinese-ink",
    sourceType: "demo-local-self",
    allowDownload: true,
    downloadScope: "self-authored",
    downloadScopeNote: "Demo sample — free to download for personal device use.",
    featured: false,
    themeId: null,
  },
  "demo-011": {
    title: "Island Above the Clouds",
    description:
      "A tiny pastel house floats on its own island, waterfall spilling into cloud. Soft clay 3D render with rounded, toy-like materials.",
    styleId: "clay-3d",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-012": {
    title: "Whale Over the Coral Canyon",
    description:
      "A whale glides above glowing coral while sunbeams cut the turquoise water. Serene underwater fantasy scaled for tablet screens.",
    styleId: "deep-ocean",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-013": {
    title: "The Floating Vale",
    description:
      "Islands drift above a waterfall valley as sunset clouds burn gold behind a distant castle. Painted at full 16:9 for desktop walls.",
    styleId: "anime-fantasy",
    sourceType: "demo-local-self",
    allowDownload: true,
    downloadScope: "self-authored",
    downloadScopeNote: "Demo sample — free to download for personal device use.",
    featured: true,
    themeId: null,
  },
  "demo-014": {
    title: "Orbit Line: Meridian City",
    description:
      "Sky bridges link sleek arcologies while traffic streams toward a ringed planet on the horizon. Cool dusk blues against warm exhaust trails.",
    styleId: "sci-fi",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-015": {
    title: "Pillars of Io",
    description:
      "Interstellar gas towers in teal and magenta under a dense star field. Astrophotography realism with a faint volumetric glow across 16:9.",
    styleId: "starry-galaxy",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-016": {
    title: "Ridgeline Aurora",
    description:
      "Violet and emerald ribbons pour over jagged alpine peaks into a mirror lake. A wide photoreal winter night for desktop displays.",
    styleId: "aurora-nights",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-017": {
    title: "Curved White",
    description:
      "One curved facade, one long shadow, and a sky that fades from sand to pale blue. Minimalist architecture with maximal negative space.",
    styleId: "architecture-minimal",
    sourceType: "demo-local-self",
    allowDownload: false,
    featured: false,
    themeId: null,
  },
  "demo-018": {
    title: "Koi of the Neon District",
    description:
      "Holographic koi swim between rain-lit towers over streaming highway lights. A wide cyberpunk night scene built for desktop screens.",
    styleId: "cyberpunk",
    sourceType: "demo-local-self",
    allowDownload: true,
    downloadScope: "self-authored",
    downloadScopeNote: "Demo sample — free to download for personal device use.",
    featured: false,
    themeId: null,
  },
};

const VIDEO_META = {
  "demo-019": {
    title: "Lanterns in the Wind (Live)",
    description:
      "The spring-galaxy illustration brought to a slow, calm loop: petals drift, lantern light breathes, the figure stays still. Five silent seconds for phone lock screens.",
    styleId: "cinematic",
    themeId: null,
  },
  "demo-020": {
    title: "Jellyfish Drift (Live)",
    description:
      "The deep-sea jellyfish pulses gently upward while marine snow drifts past. A quiet five-second underwater loop for tablets.",
    styleId: "deep-ocean",
    themeId: null,
  },
  "demo-021": {
    title: "Rain Over the Neon District (Live)",
    description:
      "Rain falls through neon while holographic koi glide between towers. Slow camera drift, five silent seconds, desktop widescreen.",
    styleId: "cyberpunk",
    themeId: null,
  },
};

const reviewedAt = "2026-10-24";
const publishedBase = Date.UTC(2026, 9, 24, 10, 0, 0);

function latestLedger() {
  if (!existsSync(LEDGERS)) return null;
  const files = readdirSync(LEDGERS).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) return null;
  const merged = { outputs: [] };
  for (const file of files) {
    const ledger = JSON.parse(readFileSync(path.join(LEDGERS, file), "utf8"));
    merged.outputs.push(...(ledger.outputs ?? []));
  }
  return merged;
}

function deviceFor(width, height) {
  const value = width / height;
  if (value <= 0.65) return "phone";
  if (value <= 1.12) return "tablet";
  return "desktop";
}

const ledger = latestLedger();
if (!ledger) {
  console.error("[build-demo-works] no generation ledger found — nothing to assemble");
  process.exit(1);
}

const byJob = new Map(ledger.outputs.map((output) => [output.jobId, output]));
const works = [];
let index = 0;

for (const job of PLAN.imageJobs) {
  const output = byJob.get(job.id);
  if (!output) continue;
  const meta = WORK_META[job.slug];
  if (!meta) throw new Error(`missing WORK_META for ${job.slug}`);
  const device = deviceFor(output.width, output.height);
  const asset = `/community-demo/images/${job.slug}.jpg`;
  works.push({
    id: `community-demo-${job.slug}`,
    slug: job.slug,
    origin: "demo_seed",
    status: "published",
    title: meta.title,
    description: meta.description,
    titleKey: null,
    descriptionKey: null,
    authorId: "demo-sample",
    themeId: meta.themeId,
    mediaType: "image",
    styleId: meta.styleId,
    deviceType: device,
    width: output.width,
    height: output.height,
    durationSeconds: null,
    sourceType: meta.sourceType,
    sourceDescription: meta.sourceType === "demo-local-self"
      ? "Generated locally with fal.ai flux-2 klein 4b for this demo; no third-party source image used."
      : "Local demo derivative of a cleared CC0 photograph.",
    sourceDescriptionKey: null,
    licenseType: "self-authored",
    licenseUrl: null,
    allowPublicDisplay: true,
    allowDownload: meta.allowDownload,
    downloadLicense: meta.allowDownload ? "self-authored" : "all-rights-reserved",
    downloadScope: meta.allowDownload ? meta.downloadScope : "custom",
    downloadScopeNote: meta.downloadScopeNote ?? null,
    reviewedAt,
    publishedAt: new Date(publishedBase - index * 3600_000).toISOString(),
    featured: meta.featured,
    previewAsset: asset,
    posterAsset: null,
    downloadAsset: meta.allowDownload ? asset : null,
  });
  index += 1;
}

for (const job of PLAN.videoJobs) {
  const output = byJob.get(job.id);
  if (!output) continue;
  const meta = VIDEO_META[job.slug];
  if (!meta) throw new Error(`missing VIDEO_META for ${job.slug}`);
  const preview = output.publicPath;
  const poster = output.posterPublicPath;
  works.push({
    id: `community-demo-${job.slug}`,
    slug: job.slug,
    origin: "demo_seed",
    status: "published",
    title: meta.title,
    description: meta.description,
    titleKey: null,
    descriptionKey: null,
    authorId: "demo-sample",
    themeId: meta.themeId,
    mediaType: "video",
    styleId: meta.styleId,
    deviceType: deviceFor(output.width, output.height),
    width: output.width,
    height: output.height,
    durationSeconds: output.durationSeconds,
    sourceType: "demo-local-self",
    sourceDescription:
      "Generated locally: fal.ai flux-2 klein 4b first frame + wan v2.2-5b image-to-video, silent H.264 MP4.",
    sourceDescriptionKey: null,
    licenseType: "self-authored",
    licenseUrl: null,
    allowPublicDisplay: true,
    allowDownload: true,
    downloadLicense: "self-authored",
    downloadScope: "self-authored",
    downloadScopeNote:
      "Demo sample — download the five-second silent MP4 for personal device use.",
    reviewedAt,
    publishedAt: new Date(publishedBase - index * 3600_000).toISOString(),
    featured: false,
    previewAsset: preview,
    posterAsset: poster,
    downloadAsset: preview,
  });
  index += 1;
}

// Sanity: probe every video again from disk and verify all assets exist.
for (const work of works) {
  for (const asset of [work.previewAsset, work.posterAsset, work.downloadAsset]) {
    if (!asset) continue;
    const relative = asset.replace(/^\/community-demo\//, "");
    if (!existsSync(path.join(PRIVATE_DEMO, relative))) {
      throw new Error(`missing demo asset for ${work.slug}: ${asset}`);
    }
  }
  if (work.mediaType === "video") {
    const bytes = readFileSync(
      path.join(PRIVATE_DEMO, "videos", `${work.slug}.mp4`)
    );
    const probe = probeMp4(bytes);
    if (probe.durationSeconds === null) throw new Error(`video probe failed: ${work.slug}`);
  }
}

writeFileSync(
  TARGET,
  `${JSON.stringify({ version: 1, works }, null, 2)}\n`
);
console.log(
  JSON.stringify(
    {
      written: path.relative(ROOT, TARGET).replaceAll("\\", "/"),
      works: works.length,
      images: works.filter((w) => w.mediaType === "image").length,
      videos: works.filter((w) => w.mediaType === "video").length,
      downloadable: works.filter((w) => w.allowDownload).length,
      viewOnly: works.filter((w) => !w.allowDownload).length,
      featured: works.filter((w) => w.featured).length,
    },
    null,
    2
  )
);
