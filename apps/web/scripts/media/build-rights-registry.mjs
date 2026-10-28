/**
 * Builds the machine-readable media rights registry and the docs inventory.
 * It never changes source files; it only records facts (hash, MIME, sources)
 * and the current publication decision.
 *
 * Usage: node scripts/media/build-rights-registry.mjs
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, isAbsolute, join, relative } from "node:path";

const ROOT = process.cwd();
const MANIFEST_PATH = join(ROOT, "scripts", "media", "photo-manifest.json");
const AUDIT_PATH = join(ROOT, "scripts", "media", "license-audit.json");
const REGISTRY_DIR = join(ROOT, "data");
const REGISTRY_PATH = join(REGISTRY_DIR, "media-rights.json");
const DOCS_PATH = join(ROOT, "..", "..", "docs", "codex", "MEDIA-ASSET-INVENTORY.md");

// The previously generated registry (normally the committed one). When
// private-media/ is absent — fresh clone, CI — the legacy private records
// are carried over verbatim from here so historical review metadata
// survives without the image bytes.
const EXISTING_REGISTRY = existsSync(REGISTRY_PATH)
  ? JSON.parse(readFileSync(REGISTRY_PATH, "utf8"))
  : null;

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const audit = JSON.parse(readFileSync(AUDIT_PATH, "utf8"));
const byOutput = new Map(manifest.map((item) => [item.output, item]));
const auditByOutput = new Map(audit.map((item) => [item.output, item]));

const PUBLIC_STYLE_IMAGES = new Set([
  "starry-galaxy",
  "mountain-lake",
  "deep-ocean",
  "aurora-nights",
  "architecture-minimal",
  "macro-nature",
  "soft-gradient",
  "abstract-light",
]);
const SELF_STYLE_IMAGES = new Set(["soft-gradient", "abstract-light"]);
const SELF_WALLPAPERS = new Set(["light-ribbons-wide"]);

// 46 style previews generated inside the project and published as WebP
// derivatives under public/images/styles/ (display-only, no download).
//
// 15 were generated on 2026-10-27 with the recorded prompts, plus the
// ink-drawing regeneration of the same date. On 2026-10-28, the
// pre-publication audit ruled the 30 "promoted legacy" previews of the
// 2026-10-27 batch back to review-pending: their promotion had relied on a
// task directive plus an AI-session visual review, which is NOT a human
// rights review — the renders have no recorded provider, date or prompt.
// All 30 affected styles were then regenerated on 2026-10-28 with the
// recorded prompts below (cosmic-horror / dark-fantasy / horror-anime first,
// then the remaining 27 as batch 2), so every one of the 46 generated
// styles has a public preview with provable provenance. The 27 superseded
// legacy derivatives stay quarantined under private-media/review-pending/
// styles/ and are retained in the registry as historical review-pending
// records under the `legacy.style.*` asset ids.
const GENERATED_STYLE_PROMPTS = {
  anime:
    "cinematic anime illustration of a lone student on a rooftop at dusk under a violet sky, glowing city lights far below, clean line art, vibrant cel shading",
  cyberpunk:
    "cyberpunk city at night with neon purple and cyan signs, rain soaked street with vivid light reflections, towering futuristic skyscrapers",
  fantasy:
    "epic fantasy landscape, floating islands with glowing waterfalls above a violet mist valley, magical light rays, detailed digital painting",
  nature:
    "serene misty mountain peaks at twilight under a deep purple and blue gradient sky, minimal moody landscape photography",
  minimalist:
    "minimalist abstract art, soft glowing violet gradient orb centered on a deep dark background, clean smooth design, subtle film grain",
  surreal:
    "surreal dreamscape, giant glowing moon over a mirror-like desert with a lone standing door, purple and pink palette, imaginative fine art",
  "anime-fantasy":
    "anime fantasy illustration, magical glowing forest with floating ruins and spirit lights, violet and teal palette, painterly anime background art",
  "paper-cut":
    "layered paper cut art of mountains and a full moon, violet and amber paper layers, soft shadows between layers, intricate papercraft diorama",
  "clay-3d":
    "cute clay 3d render, rounded chubby hills and a tiny planet with soft matte plasticine texture, pastel violet and peach palette",
  "low-poly":
    "low poly 3d geometric landscape, faceted triangular mountains under a starry night sky, violet and indigo gradient, clean flat shading",
  "stained-glass":
    "stained glass window art of a starry night sky over mountains, luminous violet blue and amber glass panes with dark lead lines",
  vaporwave:
    "vaporwave retro synthwave scene, glowing neon grid floor stretching to a purple sunset horizon, magenta and cyan glow, 80s retro futurism",
  "botanical-illustration":
    "vintage botanical illustration, detailed hand drawn ferns and flowers with delicate watercolor washes on a deep dark violet background",
  "chinese-ink":
    "traditional chinese ink wash painting, misty mountains and a winding river with generous negative space, soft violet-grey ink gradients",
  "3d-cartoon":
    "adorable 3d cartoon render, a chubby friendly little robot character floating in a pastel violet sky with soft clouds, playful mood",
  // Regenerated on 2026-10-27: the legacy ink-drawing render had an AI
  // structural error (a crane with two heads) that cropping could not fix.
  "ink-drawing":
    "elegant black ink line drawing, pine tree branch and weathered mountain rocks rendered in fine ink strokes on cream rice paper, a few crane feathers resting on the rocks, minimal negative space, traditional east asian brush illustration",
  // Regenerated on 2026-10-28 during the pre-publication audit (original
  // prompts recorded here; originals kept under
  // private-media/incoming-2026-10-28/). These replace the legacy
  // derivatives that carried watermark/logo/title artifacts and had no
  // provable provenance.
  "cosmic-horror":
    "wallpaper style preview for a cosmic horror theme: a colossal tentacled eldritch silhouette looming in deep space, swirling violet and magenta nebula clouds, scattered stars, faint eerie glow rising from below, dark purple palette, painterly dark fantasy digital illustration, moody atmosphere, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "dark-fantasy":
    "wallpaper style preview for a dark fantasy theme: a hooded phantom with a pale skeletal face standing on a misty forest path between gnarled leafless trees, a ruined stone archway glowing with violet magic light in the fog, cold blue-grey shadows with purple accents, cinematic dark fantasy digital painting, moody atmosphere, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "horror-anime":
    "wallpaper style preview for an anime horror theme: an empty school corridor at night lit by a single pale fluorescent light, a faint ghostly girl silhouette standing at the far end, cold teal and grey tones with deep shadows, unsettling quiet atmosphere, clean anime key visual illustration, crisp line art, vertical composition, no text, no letters, no posters, no logo, no signature, no watermark",
  // Batch 2 (2026-10-28): the remaining 27 styles regenerated with the
  // original prompts recorded here after the pre-publication audit revoked
  // the 2026-10-27 legacy promotion. Original renders kept under
  // private-media/incoming-2026-10-28/; each style gets an independent,
  // visually distinct preview (no image reused across styles).
  "3d-art":
    "Wallpaper style preview for a 3D art theme: a glossy abstract 3D sculpture of intertwined smooth ribbons and spheres floating over a soft studio backdrop, gentle rim lighting, pastel violet and peach materials, high-gloss reflections, polished 3D render, high detail, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "abstract":
    "Wallpaper style preview for an abstract art theme: bold flowing color gradients of magenta, violet and amber sweeping diagonally across the frame, layered translucent geometric shapes, fluid modern abstract art composition with generous negative space, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "analog-horror":
    "Wallpaper style preview for an analog horror theme: a dim empty corridor seen through a grainy VHS surveillance camera, heavy scanlines and tracking distortion, muted green-grey tones, a faint distorted silhouette at the far end, retro CRT artifacts, unsettling quiet atmosphere, vertical composition, no text, no letters, no on-screen graphics, no timestamp, no logo, no signature, no watermark",
  "charcoal-drawing":
    "Wallpaper style preview for a charcoal drawing theme: a dramatic charcoal sketch of weathered sea cliffs with crashing waves, bold smudged strokes and expressive shading, deep blacks and soft grey tones, textured paper grain, fine art sketch, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "chibi":
    "Wallpaper style preview for a chibi anime theme: an original cute chibi witch girl with an oversized head holding a tiny glowing star wand, kawaii pastel colors, soft rounded shapes, playful cheerful mood, clean anime illustration, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "cinematic":
    "Wallpaper style preview for a cinematic theme: a lone figure with an umbrella on a rain-slick street at dusk, warm orange storefront glow against teal shadows, anamorphic lens flare, shallow depth of field, teal and orange film color grade, dramatic movie still mood, vertical composition, no text, no letters, no signages, no logo, no signature, no watermark",
  "cozy-anime":
    "Wallpaper style preview for a cozy slice-of-life anime theme: a sunlit small balcony cafe with potted green plants, a steaming cup and a sleeping cat on a wooden chair, warm gentle afternoon light, peaceful nostalgic atmosphere, soft colors, iyashikei anime background art, vertical composition, no text, no letters, no signboards, no logo, no signature, no watermark",
  "dark":
    "Wallpaper style preview for a dark moody theme: a foggy pine forest at night, a thin beam of pale moonlight cutting between tall black tree silhouettes, deep shadows, low-key lighting, mysterious minimal atmosphere, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "dreamcore":
    "Wallpaper style preview for a dreamcore theme: an endless pastel sky with soft pink clouds and a faint window frame floating in the haze, ethereal nostalgic light, surreal dreamlike atmosphere, soft focus glow, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "gothic-horror":
    "Wallpaper style preview for a gothic horror theme: a towering ruined cathedral silhouette under a huge full moon, thick ground fog, black and crimson palette with violet accents, ornate spires and faintly glowing arched windows, ominous atmosphere, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "manga":
    "Wallpaper style preview for a manga theme: a black and white manga illustration of an original lone swordsman on a windy rooftop, dramatic speed-line sky, bold ink linework, screentone shading, dynamic monochrome panel composition, vertical composition, no text, no letters, no speech bubbles, no sound effects, no logo, no signature, no watermark",
  "mecha":
    "Wallpaper style preview for a mecha anime theme: an original giant humanoid robot standing in a vast launch hangar, detailed panel lines and metallic sheen, elevated walkways for scale, epic dramatic lighting, technical precision anime illustration, vertical composition, no text, no letters, no markings, no logo, no signature, no watermark",
  "nightmare-surrealism":
    "Wallpaper style preview for a nightmare surrealism theme: an impossible stone staircase spiraling around a floating doorway in a starless void, twisted arches and drifting fragments, haunting dreamlike dark surreal art, muted violet and grey palette, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "occult-ritual":
    "Wallpaper style preview for an occult ritual theme: a circle of ancient weathered standing stones with glowing candle flames and drifting incense smoke, faint abstract sigils of light hovering in the air, deep midnight blue and amber palette, mystical ancient ceremony atmosphere, vertical composition, no text, no letters, no readable runes, no logo, no signature, no watermark",
  "oil-painting":
    "Wallpaper style preview for an oil painting theme: a classical oil painting of a stormy sea clashing with rugged cliffs at golden dusk, rich impasto brushwork, layered pigments, dramatic chiaroscuro lighting, museum quality fine art, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "pencil-sketch":
    "Wallpaper style preview for a pencil sketch theme: a detailed graphite drawing of an old stone bridge over a quiet river with trees and distant hills, delicate hatching and soft shading, monochrome tones on textured paper, fine art drawing, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "photography":
    "Wallpaper style preview for a photography theme: a macro photograph of morning dew on a spider web backlit by golden sunrise light in a meadow, creamy natural bokeh, sharp focus on glistening threads, high dynamic range, photorealistic, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "pixel-art":
    "Wallpaper style preview for a pixel art theme: a retro 16-bit pixel art night cityscape with glowing windows and a tiny hero on a rooftop under pixel stars, crisp limited palette of indigo, violet and cyan, clean dithering, chunky pixel detail, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "post-apocalyptic":
    "Wallpaper style preview for a post-apocalyptic horror theme: a ruined city street swallowed by thick fog and overgrown vines, collapsed buildings, a lone rusted tram, desolate end-of-days atmosphere, decay and soft green overgrowth, muted grey palette, vertical composition, no text, no letters, no signages, no logo, no signature, no watermark",
  "psychological-horror":
    "Wallpaper style preview for a psychological horror theme: an endless empty corridor with identical pale doors and humming fluorescent lights, subtly warped perspective, oppressive silence, liminal space unease, washed-out beige and green palette, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "retro-cel":
    "Wallpaper style preview for a retro 90s anime theme: an original teenage pilot leaning against a propeller plane at a coastal airfield during an orange sunset, classic cel shading, vintage film grain, nostalgic warm color palette, hand-painted background, retro anime illustration, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "sci-fi":
    "Wallpaper style preview for a sci-fi theme: a colossal ring space station orbiting a violet gas giant with a fleet of small ships heading toward it, volumetric light rays, epic scale futuristic concept art, deep starry backdrop, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "shonen":
    "Wallpaper style preview for a shonen anime theme: an original young martial artist with a flowing red scarf leaping mid-air surrounded by crackling golden energy, dramatic speed lines, bold saturated colors, energetic dynamic action composition, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "shoujo":
    "Wallpaper style preview for a shoujo anime theme: an original girl in a school uniform standing under drifting cherry blossom petals, sparkling highlights, soft rose-gold light, romantic roses framing the scene, delicate linework, dreamy pastel mood, shoujo anime style, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "supernatural-horror":
    "Wallpaper style preview for a supernatural horror theme: a ghostly pale figure in a tattered white dress floating at the end of an abandoned wooden hallway, cold blue light seeping through broken boards, dust motes in eerie light shafts, unsettling atmosphere, vertical composition, no text, no letters, no logo, no signature, no watermark",
  "ukiyo-e-anime":
    "Wallpaper style preview for a ukiyo-e anime theme: a great stylized indigo wave curling beneath a distant volcanic peak, flat color planes, elegant traditional woodblock print composition with cloud bands and a small red sun, ukiyo-e anime fusion style, vertical composition, no text, no letters, no kanji, no logo, no signature, no watermark",
  "watercolor":
    "Wallpaper style preview for a watercolor theme: a delicate watercolor painting of a hillside village with terraced lavender fields in soft morning light, blooming translucent pigment washes, visible paper texture, gentle pastel palette with artistic whitespace, vertical composition, no text, no letters, no logo, no signature, no watermark",
};
// The 2026-10-27 "promotion" of 30 legacy previews was revoked on
// 2026-10-28: a task directive plus an AI visual review is not a human
// rights review, and the renders lack provider/date/prompt evidence. Their
// WebP derivatives are quarantined under private-media/review-pending/
// styles/ again; the original JPGs remain archived under
// private-media/archive/styles/. The 27 affected styles were regenerated
// the same day (batch 2, prompts above), so every style has a provenance-
// backed public preview; the superseded legacy derivatives are retained
// below as historical review-pending records (legacy.style.*).
// Historical remote style URLs. The image fields were removed from
// lib/styles.ts so no unverified URL ships in the client bundle; the prompts
// are retained here only so the audit inventory can identify the old source.
const REMOTE_STYLES = [
  {
    id: "anime",
    prompt:
      "anime wallpaper art, girl in school uniform standing under glowing cherry blossoms at night, purple lantern light, dreamy violet sky, studio anime illustration, highly detailed",
    size: "portrait_16_9",
  },
  {
    id: "cyberpunk",
    prompt:
      "cyberpunk city wallpaper at night, neon purple and cyan signs, rain soaked street reflections, towering futuristic skyscrapers, cinematic digital art, moody atmosphere",
    size: "portrait_16_9",
  },
  {
    id: "fantasy",
    prompt:
      "epic fantasy wallpaper, floating islands with glowing waterfalls above a violet mist valley, magical light rays, detailed digital painting",
    size: "portrait_16_9",
  },
  {
    id: "nature",
    prompt:
      "serene nature wallpaper, misty mountain peaks at twilight under a deep purple and blue gradient sky, minimal moody landscape photography",
    size: "portrait_16_9",
  },
  {
    id: "minimalist",
    prompt:
      "minimalist abstract wallpaper, soft glowing violet gradient orb centered on a deep dark background, clean smooth design, subtle film grain",
    size: "portrait_16_9",
  },
  {
    id: "surreal",
    prompt:
      "surreal dreamscape wallpaper, giant glowing moon over a mirror like desert with a lone standing door, purple and pink palette, imaginative fine art",
    size: "portrait_16_9",
  },
];
const DEMO_IDS = [
  "night-sakura",
  "neon-rain",
  "star-drift",
  "jellyfish-glow",
  "aurora-veil",
  "sunset-station",
  "forest-light",
  "flower-field",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const posix = (path) => path.replaceAll("\\", "/");
const rel = (path) => posix(relative(ROOT, path));
const mimeOf = (path) => {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  return "application/octet-stream";
};

function fileRecord({ assetId, path, usage, sourceType, reviewStatus, canPubliclyDisplay, canOfferDownload, publiclyAccessible, notes, parentAssetIds = [], source = null }) {
  const absolute = isAbsolute(path) ? path : join(ROOT, path);
  if (!existsSync(absolute)) throw new Error(`missing asset: ${path}`);
  const bytes = readFileSync(absolute);
  const auditRecord = source ? auditByOutput.get(source.output) : null;
  return {
    assetId,
    path: publiclyAccessible ? `/${posix(relative(join(ROOT, "public"), absolute))}` : rel(absolute),
    privatePath: publiclyAccessible ? null : rel(absolute),
    mime: mimeOf(path),
    bytes: statSync(absolute).size,
    sha256: sha256(bytes),
    usage,
    sourceType,
    sourceUrl: source?.sourcePage ?? null,
    sourceFileUrl: source?.sourceUrl ?? null,
    sourceTitle: source?.sourceTitle ?? null,
    author: source?.author ?? (sourceType === "self-authored" ? "WallHaze (self-authored)" : null),
    licenseType: source?.license ?? (sourceType === "self-authored" ? "self-authored" : "unknown"),
    licenseUrl: source?.licenseUrl ?? null,
    licenseEvidence:
      source?.licenseEvidence ??
      (sourceType === "self-authored"
        ? "Generated locally by repository scripts; no third-party source used."
        : null),
    auditCheckedAt: auditRecord?.checkedAt ?? null,
    auditVerified: auditRecord?.licenseVerified ?? null,
    attributionRequired: auditRecord?.attributionRequired === "true" ? true : source?.license === "CC0" ? false : null,
    attributionText:
      source?.license === "CC0"
        ? `${source.author} · CC0 1.0`
        : sourceType === "self-authored"
          ? "WallHaze · self-authored"
          : null,
    modificationNotes: source?.modifications ?? "None recorded.",
    thirdPartyRights:
      source?.thirdPartyRights ??
      (reviewStatus === "pending"
        ? "Unknown: legacy file has no per-file provenance; may contain characters, trademarks or identifiable people."
        : reviewStatus === "restricted"
          ? "Unknown: external generator output; no provider/model terms or release evidence."
          : "No known third-party rights; see source record."),
    aiGenerated:
      sourceType === "wikimedia-cc0"
        ? false
        : sourceType === "self-authored"
          ? false
          : "unknown",
    reviewStatus,
    canPubliclyDisplay,
    canOfferDownload,
    publiclyAccessible,
    externalAccessible: false,
    parentAssetIds,
    reviewedAt: "2026-10-24",
    reviewedBy: "automated-rights-audit",
    notes,
  };
}

const assets = [];

// 31 legacy local style previews: moved to private-media. The directory is
// local-only (git-ignored); in a fresh clone / CI it does not exist and
// these loops simply contribute nothing (see the legacy.style.* fallback in
// the WebP loop below).
const privateStyleDir = join(ROOT, "private-media", "review-pending", "styles");
const hasPrivateStyleDir = existsSync(privateStyleDir);
for (const name of hasPrivateStyleDir
  ? readdirSync(privateStyleDir).filter((f) => f.endsWith(".jpg")).sort()
  : []) {
  const id = name.replace(/\.jpg$/, "");
  assets.push(
    fileRecord({
      assetId: `style.${id}`,
      path: join(privateStyleDir, name),
      usage: "style-preview",
      sourceType: "legacy-local-unknown",
      reviewStatus: "pending",
      canPubliclyDisplay: false,
      canOfferDownload: false,
      publiclyAccessible: false,
      notes:
        "Legacy local style image with no per-file licence evidence. Moved out of public/; restore only after a human review records evidence.",
    })
  );
}

// 8 cleared public style previews.
for (const name of readdirSync(join(ROOT, "public", "images", "styles"))
  .filter((f) => f.endsWith(".jpg"))
  .sort()) {
  const id = name.replace(/\.jpg$/, "");
  if (!PUBLIC_STYLE_IMAGES.has(id)) continue;
  const source = byOutput.get(`/images/styles/${name}`) ?? null;
  const self = SELF_STYLE_IMAGES.has(id);
  assets.push(
    fileRecord({
      assetId: `style.${id}`,
      path: join(ROOT, "public", "images", "styles", name),
      usage: "style-preview",
      sourceType: self ? "self-authored" : "wikimedia-cc0",
      reviewStatus: "verified",
      canPubliclyDisplay: true,
      canOfferDownload: true,
      publiclyAccessible: true,
      source,
      notes: self
        ? "Procedural abstract style preview; self-authored, no third-party source."
        : "CC0 photograph with Commons evidence; public display and download permitted.",
    })
  );
}

// 46 project-generated style previews (WebP derivatives under public/).
// Every .webp in the directory must be classified — a stray file fails the
// build so the registry can never silently drift from the public surface.
for (const name of readdirSync(join(ROOT, "public", "images", "styles"))
  .filter((f) => f.endsWith(".webp"))
  .sort()) {
  const id = name.replace(/\.webp$/, "");
  const prompt = GENERATED_STYLE_PROMPTS[id];
  if (!prompt) {
    throw new Error(`unclassified style webp: ${name}`);
  }
  const originalJpg = join(
    ROOT,
    "private-media",
    "incoming-2026-10-28",
    `${id}.jpg`
  );
  const originalNote = existsSync(originalJpg)
    ? ` Original render archived at private-media/incoming-2026-10-28/${id}.jpg.`
    : "";
  const absolute = join(ROOT, "public", "images", "styles", name);
  const bytes = readFileSync(absolute);
  assets.push({
    assetId: `style.${id}`,
    path: `/images/styles/${name}`,
    privatePath: null,
    mime: "image/webp",
    bytes: statSync(absolute).size,
    sha256: sha256(bytes),
    usage: "style-preview",
    sourceType: "project-generated-ai",
    sourceUrl: null,
    sourceFileUrl: null,
    sourceTitle: null,
    author: "WallHaze (project-generated AI)",
    licenseType: "project-generated",
    licenseUrl: null,
    licenseEvidence:
      "Generated with the project's approved text-to-image pipeline using the original prompt recorded above; generation date 2026-10-27/28.",
    auditCheckedAt: null,
    auditVerified: null,
    attributionRequired: false,
    attributionText: null,
    modificationNotes:
      "Top 1.2% / bottom 5.5% cropped to strip the generator watermark; downscaled to 768px WebP q80.",
    thirdPartyRights:
      "Project-generated AI output from an original text prompt; no third-party source material, named artists or trademarked characters referenced. Provider terms accepted by the project for internal generation; download is disabled.",
    aiGenerated: true,
    provider: "project text-to-image pipeline (2026-10-27/28)",
    reviewStatus: "verified",
    canPubliclyDisplay: true,
    canOfferDownload: false,
    publiclyAccessible: true,
    externalAccessible: false,
    parentAssetIds: [],
    reviewedAt: "2026-10-28",
    reviewedBy: "pre-publication audit 2026-10-28 (prompt + pipeline records verified)",
    notes:
      `Fresh style preview for the style selector and homepage; display-only (no download).${originalNote} Takedown: node scripts/media/rights-admin.mjs takedown --asset style.${id} ...`,
  });
}

// 27 legacy style WebP derivatives, demoted on 2026-10-28 and retained as
// historical review-pending records under the `legacy.style.*` ids. Their
// 2026-10-27 promotion rested on a task directive plus an AI-session visual
// review — not a human rights review — and the renders have no recorded
// provider, date or prompt. Public display of these styles is now covered
// by fresh independently generated previews (`style.*`, prompts above); the
// legacy derivatives stay quarantined outside public/ and their original
// JPGs remain archived under private-media/archive/styles/.
for (const name of hasPrivateStyleDir
  ? readdirSync(privateStyleDir).filter((f) => f.endsWith(".webp")).sort()
  : []) {
  const id = name.replace(/\.webp$/, "");
  assets.push(
    fileRecord({
      assetId: `legacy.style.${id}`,
      path: join(ROOT, "private-media", "review-pending", "styles", name),
      usage: "style-preview",
      sourceType: "legacy-local-unknown",
      reviewStatus: "pending",
      canPubliclyDisplay: false,
      canOfferDownload: false,
      publiclyAccessible: false,
      notes:
        `Superseded for display by a new independently generated preview (style.${id}). Legacy project render (no recorded provider, date or prompt) demoted from public/ on 2026-10-28 after the pre-publication audit revoked the 2026-10-27 promotion; original JPG archived at private-media/archive/styles/. Retained as a historical review-pending record; restore only after a human review records evidence.`,
    })
  );
}

// Fresh clone / CI: private-media/ is local-only and not part of the
// repository. Carry the committed legacy.style.* records over verbatim
// (metadata only — paths, hashes, review notes; no image bytes) so the
// pending review history is preserved and the registry stays reproducible
// without the private files. This never changes their review status; if a
// future private workspace adds more pending records, extend this fallback
// or keep the directory present when regenerating the registry.
if (!hasPrivateStyleDir) {
  for (const prev of EXISTING_REGISTRY?.assets ?? []) {
    if (prev.assetId.startsWith("legacy.style.")) assets.push(prev);
  }
}

// 11 wallpaper files.
for (const name of readdirSync(join(ROOT, "public", "images", "wallpapers"))
  .filter((f) => f.endsWith(".jpg"))
  .sort()) {
  const id = name.replace(/\.jpg$/, "");
  const source = byOutput.get(`/images/wallpapers/${name}`) ?? null;
  const self = SELF_WALLPAPERS.has(id);
  assets.push(
    fileRecord({
      assetId: `wallpaper.${id}`,
      path: join(ROOT, "public", "images", "wallpapers", name),
      usage: "gallery-wallpaper",
      sourceType: self ? "self-authored" : "wikimedia-cc0",
      reviewStatus: "verified",
      canPubliclyDisplay: true,
      canOfferDownload: true,
      publiclyAccessible: true,
      source,
      notes: self
        ? "Procedural wallpaper; self-authored, no third-party source."
        : "CC0 photograph crop; public display and download permitted.",
    })
  );
}

// 8 demos x (MP4, poster, source frame).
for (const demo of DEMO_IDS) {
  const frameOutput = `/videos/live-demos/${demo}-frame.jpg`;
  const source = byOutput.get(frameOutput) ?? null;
  if (!source) throw new Error(`missing manifest source for ${demo}`);
  assets.push(
    fileRecord({
      assetId: `frame.${demo}`,
      path: join(ROOT, "public", "videos", "live-demos", `${demo}-frame.jpg`),
      usage: "live-demo-source-frame",
      sourceType: "wikimedia-cc0",
      reviewStatus: "verified",
      canPubliclyDisplay: true,
      canOfferDownload: true,
      publiclyAccessible: true,
      source,
      notes: "CC0 source frame used to build the local motion demo.",
    }),
    fileRecord({
      assetId: `poster.${demo}`,
      path: join(ROOT, "public", "videos", "live-demos", `${demo}.jpg`),
      usage: "live-demo-poster",
      sourceType: "wikimedia-cc0",
      reviewStatus: "verified",
      canPubliclyDisplay: true,
      canOfferDownload: true,
      publiclyAccessible: true,
      source,
      parentAssetIds: [`frame.${demo}`],
      notes: "Poster derived from the source frame; no third-party addition.",
    }),
    fileRecord({
      assetId: `video.${demo}`,
      path: join(ROOT, "public", "videos", "live-demos", `${demo}.mp4`),
      usage: "live-demo-video",
      sourceType: "wikimedia-cc0",
      reviewStatus: "verified",
      canPubliclyDisplay: true,
      canOfferDownload: true,
      publiclyAccessible: true,
      source,
      parentAssetIds: [`frame.${demo}`],
      notes:
        "Silent 5s H.264 loop with local camera drift and particles; source photograph is CC0, local derivative is not AI-generated.",
    })
  );
}

// 6 historical remote style previews. Their URLs were removed from the
// exported catalogue and are not served by this site.
const remoteUrl = (prompt, size) =>
  `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
    prompt
  )}&image_size=${size}`;
for (const remote of REMOTE_STYLES) {
  const id = remote.id;
  const url = remoteUrl(remote.prompt, remote.size);
  assets.push({
    assetId: `remote.style.${id}`,
    path: url,
    privatePath: null,
    mime: "image/jpeg",
    bytes: null,
    sha256: null,
    usage: "style-preview",
    sourceType: "external-ai-unknown",
    sourceUrl: null,
    sourceFileUrl: url,
    sourceTitle: null,
    author: null,
    licenseType: "unknown",
    licenseUrl: null,
    licenseEvidence: null,
    auditCheckedAt: null,
    auditVerified: false,
    attributionRequired: null,
    attributionText: null,
    modificationNotes: "Remote text-to-image endpoint; no local derivative recorded.",
    thirdPartyRights:
      "Unknown: no provider/model terms, model version or output-rights evidence; may depict characters or styles requiring additional rights.",
    aiGenerated: true,
    provider: "trae-api-cn.mchost.guru",
    reviewStatus: "restricted",
    canPubliclyDisplay: false,
    canOfferDownload: false,
    publiclyAccessible: false,
    externalAccessible: true,
    parentAssetIds: [],
    reviewedAt: "2026-10-24",
    reviewedBy: "automated-rights-audit",
    notes:
      "Removed from the exported style catalogue. External URL is outside this site's control; do not re-enable without evidence.",
  });
}

// Two retired remote hero/demo URLs. They are no longer referenced; recorded
// so the audit covers the historical public surface.
for (const retired of [
  {
    assetId: "remote.hero.legacy",
    prompt:
      "breathtaking surreal wallpaper artwork, violet and blue nebula sky over a futuristic city with glowing purple lights, cinematic atmosphere, ultra detailed digital painting, dark moody tones",
    size: "landscape_16_9",
  },
  {
    assetId: "remote.studio-sample.legacy",
    prompt:
      "astronaut floating in a glowing purple nebula surrounded by stars, cinematic sci-fi phone wallpaper, deep violet and blue palette, ultra detailed digital art",
    size: "portrait_16_9",
  },
]) {
  assets.push({
    assetId: retired.assetId,
    path: remoteUrl(retired.prompt, retired.size),
    privatePath: null,
    mime: "image/jpeg",
    bytes: null,
    sha256: null,
    usage: retired.assetId.includes("hero") ? "hero" : "studio-sample",
    sourceType: "external-ai-unknown",
    sourceUrl: null,
    sourceFileUrl: remoteUrl(retired.prompt, retired.size),
    sourceTitle: null,
    author: null,
    licenseType: "unknown",
    licenseUrl: null,
    licenseEvidence: null,
    auditCheckedAt: null,
    auditVerified: false,
    attributionRequired: null,
    attributionText: null,
    modificationNotes: "Remote generator URL; retired from the UI.",
    thirdPartyRights: "Unknown external AI output; no provider/model/rights evidence.",
    aiGenerated: true,
    provider: "trae-api-cn.mchost.guru",
    reviewStatus: "restricted",
    canPubliclyDisplay: false,
    canOfferDownload: false,
    publiclyAccessible: false,
    externalAccessible: true,
    parentAssetIds: [],
    reviewedAt: "2026-10-24",
    reviewedBy: "automated-rights-audit",
    notes:
      "Retired from the public homepage/Studio preview; no longer referenced by code.",
  });
}

assets.sort((a, b) => a.assetId.localeCompare(b.assetId));

const registry = {
  version: 1,
  generatedAt: new Date().toISOString(),
  reviewedAt: "2026-10-24",
  reviewedBy: "automated-rights-audit",
  policy: {
    publication:
      "A file is served only when canPubliclyDisplay=true and it lives under public/. Pending/restricted files live outside public/ and are not served by Next.js.",
    download:
      "canOfferDownload mirrors the product gate; it is not a licence by itself. CC0/self-authored only in this dataset.",
    review:
      "No automated process may promote review-pending to verified. A human reviewer must record evidence and use scripts/media/restore-asset.mjs.",
  },
  counts: {
    total: assets.length,
    verified: assets.filter((a) => a.reviewStatus === "verified").length,
    pending: assets.filter((a) => a.reviewStatus === "pending").length,
    restricted: assets.filter((a) => a.reviewStatus === "restricted").length,
    rejected: assets.filter((a) => a.reviewStatus === "rejected").length,
    removed: assets.filter((a) => a.reviewStatus === "removed").length,
  },
  assets,
};

mkdirSync(REGISTRY_DIR, { recursive: true });
writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);

const rows = assets
  .map(
    (a) =>
      `| \`${a.assetId}\` | ${a.usage} | \`${a.path}\` | ${a.licenseType} | ${a.reviewStatus} | ${a.canPubliclyDisplay ? "yes" : "no"} | ${a.canOfferDownload ? "yes" : "no"} | ${a.publiclyAccessible ? "yes" : "no"} | ${a.sha256 ? a.sha256.slice(0, 12) : "—"} |`
  )
  .join("\n");

const markdown = `# WallHaze V2.0 媒体资产清单

- 生成时间：${registry.generatedAt}
- 机器可读源：\`apps/web/data/media-rights.json\`
- 复核基准日：2026-10-24
- 资产总数：**${registry.counts.total}**
- verified：**${registry.counts.verified}**；pending：**${registry.counts.pending}**；restricted：**${registry.counts.restricted}**；rejected：**${registry.counts.rejected}**；removed：**${registry.counts.removed}**

> 规则：只有 \`canPubliclyDisplay=true\` 且位于 \`public/\` 的文件会被 Next.js 直接提供。pending/restricted 文件已移出 \`public/\`，原始 URL 返回 404。没有文件被删除；映射与哈希在 \`private-media/review-pending/manifest.json\`。

| Asset ID | 用途 | 当前路径 | 授权 | reviewStatus | 公开展示 | 允许下载 | 公开可访问 | SHA-256 前 12 位 |
|---|---|---|---|---|---|---|---|---|
${rows}

## 来源分类

- \`wikimedia-cc0\`：Wikimedia Commons 的 CC0 照片；逐文件来源、作者、许可和核验日期见 \`photo-manifest.json\` / \`license-audit.json\`。
- \`self-authored\`：仓库脚本本地绘制的抽象图；无第三方源。
- \`project-generated-ai\`：项目内置 text-to-image 管线生成的风格预览（WebP，仅展示、不提供下载），逐张记录原创提示词与生成日期（2026-10-27/28），生成器水印条已裁除。
- \`legacy-local-unknown\`：旧本地风格图的 WebP 派生（\`legacy.style.*\`，27 张），无逐文件授权证据；2026-10-28 移出 \`public/\` 后作为历史待审记录保留，未被晋升为 verified，原始 JPG 归档于 \`private-media/archive/styles/\`。同 id 风格的公开展示已由带完整提示词记录的新原创生成图（\`style.*\`）覆盖。
- \`external-ai-unknown\`：旧外部 text-to-image URL，无法验证 provider/model/输出权利；已从导出目录移除。

## 未完成

- 2026-10-28 发布前审核：撤销 2026-10-27 对 30 张 legacy 预览图的晋升（当时的依据是任务指令 + AI 会话视觉审查，不构成人工版权审核；生成 provider/日期/提示词均无记录）。
- 2026-10-28 第二批原创生成（当日完成）：为其余 27 个风格（3d-art、abstract、analog-horror、charcoal-drawing、chibi、cinematic、cozy-anime、dark、dreamcore、gothic-horror、manga、mecha、nightmare-surrealism、occult-ritual、oil-painting、pencil-sketch、photography、pixel-art、post-apocalyptic、psychological-horror、retro-cel、sci-fi、shonen、shoujo、supernatural-horror、ukiyo-e-anime、watercolor）用记录在案的原创提示词独立生成预览图，逐风格不重复。至此 54 个风格全部配备真实预览图（46 张项目生成 WebP + 8 张已核验 CC0/自绘 JPG），不再存在渐变占位；新图原始 JPG 归档于 \`private-media/incoming-2026-10-28/\`。
- 27 张被取代的 legacy WebP 派生仍以 \`legacy.style.*\` 保留在 \`private-media/review-pending/styles/\`，状态保持 pending（历史记录，不作为发布依据）；如需处置，经人工审核后使用 \`restore-asset.mjs\`。
- 6 个外部 AI 风格 URL 和 2 个已退役 hero/demo URL 无法核实 provider 条款；只在清单保留记录，不再公开引用。
`;
mkdirSync(join(ROOT, "..", "..", "docs", "codex"), { recursive: true });
writeFileSync(DOCS_PATH, markdown);

console.log(
  JSON.stringify(
    {
      registry: rel(REGISTRY_PATH),
      inventory: posix(relative(ROOT, DOCS_PATH)),
      counts: registry.counts,
    },
    null,
    2
  )
);
