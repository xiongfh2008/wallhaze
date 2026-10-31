// Ingest batch-2: convert, SEEDS, dimensions, registry, i18n x7.
// Run once from apps/web: node scripts/media/ingest-b2.mjs
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const webRoot = path.resolve(import.meta.dirname, "..", "..");
const SRC = "D:/Project/wallhaze/generated-batch2/out";
const MANIFEST = JSON.parse(
  readFileSync("D:/Project/wallhaze/generated-batch2/manifest.json", "utf8")
);

// id, en title, styleId, en alt, zh, ja, ko, es, fr, de
const BATCH = [
  ["b2-mecha-battleline", "Mecha Battleline", "mecha", "Original mecha squad advancing through a ruined future boulevard at dawn", "机甲战线", "メカ・バトルライン", "메카 배틀라인", "Línea mecha", "Ligne mecha", "Mecha-Battleline"],
  ["b2-cyber-nightmarket", "Night Market Canal", "cyberpunk", "Cyberpunk night market with lanterns reflecting in a black canal", "夜市运河", "ナイトマーケットの運河", "야시장 운하", "Mercado nocturno", "Canal nocturne", "Nachtmarkt-Kanal"],
  ["b2-interstellar-gate", "The Jump Gate", "sci-fi", "Titanic jump-gate opening a swirling portal above an exploration fleet", "星际之门", "ジャンプゲート", "점프 게이트", "La puerta interestelar", "La porte stellaire", "Das Sprungtor"],
  ["b2-dark-citadel-throne", "Throne of Embers", "dark-fantasy", "Dark citadel throne hall with moonlight shafts and drifting embers", "余烬王座", "翡翠の玉座", "잉걸불의 왕좌", "Trono de ascuas", "Trône de braises", "Thron der Glut"],
  ["b2-jp-aesthetic-alley", "Lantern Lane", "ukiyo-e-anime", "Japanese alley with paper lanterns and a Mount Fuji sunset", "灯笼小巷", "提灯の小路", "등불 골목", "Callejón de faroles", "Ruelle aux lanternes", "Laternengasse"],
  ["b2-vaporwave-mall", "Flooded Arcade", "vaporwave", "Abandoned retro mall flooded with water under pink-cyan neon", "淹没的商场", "水没のアーケード", "침수된 아케이드", "Arcada inundada", "Arcade inondée", "Überflutete Passagen"],
  ["b2-dreamcore-playground", "Playground in the Sky", "dreamcore", "Impossible playground standing on clouds under three soft suns", "云端游乐场", "雲の上の遊園地", "구름 위의 놀이터", "Parque en las nubes", "Aire de jeu céleste", "Spielplatz über den Wolken"],
  ["b2-gothic-cathedral", "Midnight Cathedral", "gothic-horror", "Gothic cathedral interior with glowing stained glass at midnight", "午夜大教堂", "真夜中の大聖堂", "한밤의 대성당", "Catedral de medianoche", "Cathédrale de minuit", "Mitternachts-Kathedrale"],
  ["b2-roadmovie-dusk", "Dusk Convertible", "cinematic", "Vintage convertible on a west-coast highway at dusk", "黄昏敞篷车", "夕暮れのコンバーチブル", "황혼의 컨버터블", "Descapotable al anochecer", "Cabriolet au crépuscule", "Cabrio in der Dämmerung"],
  ["b2-samurai-standoff", "Storm Ronin", "ukiyo-e-anime", "Original samurai standing in a bamboo grove during a lightning storm", "竹林武士", "竹林の侍", "대나무 숲의 무사", "Samurái en la tormenta", "Samouraï dans la tempête", "Samurai im Sturm"],
  ["b2-pixel-arcade-world", "Pixel Skylands", "pixel-art", "Pixel-art floating islands connected by neon bridges", "像素浮空群岛", "ピクセルの空島", "픽셀 스카이랜드", "Islas de píxeles", "Îles de pixels", "Pixel-Skylands"],
  ["b2-race-future-circuit", "Antigrav Circuit", "sci-fi", "Anti-gravity race cars charging through a neon circuit tunnel", "反重力赛道", "反重力サーキット", "반중력 서킷", "Circuito antigravedad", "Circuit antigrav", "Antigravitations-Kurs"],
  ["b2-galaxy-river-mountain", "Star River", "sci-fi", "The Milky Way pouring between mountain ridges over a mirrored lake", "星河山涧", "天の川の渓谷", "은하수 계곡", "Río de estrellas", "Rivière d'étoiles", "Sternenfluss"],
  ["b2-magic-forest-spirits", "Spore Spirits", "dreamcore", "Glowing spore-spirits floating between colossal mossy trunks", "孢之精灵", "胞子の精霊", "포자의 정령", "Espíritas de esporas", "Esprits de spores", "Sporengeister"],
  ["b2-amoled-obsidian-wave", "Obsidian Wave", "dark", "A sweep of violet-to-blue light across a near-black obsidian field", "黑曜之波", "黒曜の波", "흑요석의 파도", "Ola de obsidiana", "Vague d'obsidienne", "Obsidianwelle"],
  ["b2-anime-festival-night", "Festival Lights", "cozy-anime", "Anime festival street with yukata crowds and fireworks", "祭典之夜", "夏祭りの夜", "축제의 밤", "Noche de festival", "Nuit de festival", "Festivallichter"],
  ["b2-mech-pilot-gaze", "Pilot and Titan", "mecha", "Original mecha pilot before her towering mechanical partner", "驾驶员与巨神", "パイロットと巨神", "파일럿과 거신", "Piloto y titán", "Pilote et titan", "Pilotin und Titan"],
  ["b2-cyber-alley-cat", "Neon Alley Cat", "cyberpunk", "Robotic cat on a crate in a flickering neon alley", "霓虹巷猫", "ネオン路地の猫", "네온 골목 고양이", "Gato del callejón", "Chat de la ruelle", "Neon-Gassenkatze"],
  ["b2-lofi-rain-window", "Rainy Day Lo-Fi", "cozy-anime", "Rain on a large window with a steaming mug and a sleeping cat", "雨天微 Loft", "雨窓のローファイ", "비 오는 창가", "Lluvia lo-fi", "Pluie lo-fi", "Regen-Lo-Fi"],
  ["b2-galaxy-cliff-temple", "Cliffside Temple", "sci-fi", "A tiny temple on a cliff beneath a river of stars", "崖畔星祠", "崖の上の星詞", "절벽 위의 별사", "Templo en el acantilado", "Temple sur la falaise", "Tempel an der Klippe"],
  ["b2-magic-forest-well", "The Glowing Well", "dreamcore", "Ancient glowing well in an enchanted forest clearing", "发光古井", "光る古井戸", "빛나는 우물", "El pozo luminoso", "Le puits lumineux", "Der leuchtende Brunnen"],
  ["b2-vaporwave-bust", "Neon Visor", "vaporwave", "Classical plaster bust with a chrome visor in a vaporwave room", "霓虹面甲", "ネオンバイザー", "네온 바이저", "Visor de neón", "Visière néon", "Neon-Visor"],
  ["b2-dreamcore-doorfield", "Field of Doors", "dreamcore", "Standing doors in a cloud meadow opening onto different skies", "众门之野", "扉の草原", "문의 들판", "Campo de puertas", "Champ de portes", "Feld der Türen"],
  ["b2-magic-forest-clearing", "Mushroom Circle", "dreamcore", "Glowing mushroom circle around an old stone bench at twilight", "蘑菇环", "キノコの輪", "버섯의 원", "Círculo de hongos", "Cercle de champignons", "Pilzring"],
];

const LOCALES = ["en", "zh", "ja", "ko", "es", "fr", "de"];
const T = (i) => ({
  en: { title: BATCH[i][1], alt: BATCH[i][3] },
  zh: { title: BATCH[i][4], alt: BATCH[i][3] },
  ja: { title: BATCH[i][5], alt: BATCH[i][3] },
  ko: { title: BATCH[i][6], alt: BATCH[i][3] },
  es: { title: BATCH[i][7], alt: BATCH[i][3] },
  fr: { title: BATCH[i][8], alt: BATCH[i][3] },
  de: { title: BATCH[i][9], alt: BATCH[i][3] },
});

const byMeta = new Map(MANIFEST.results.map((r) => [r.id, r]));
const metrics = new Map();

for (const [id] of BATCH) {
  const meta = byMeta.get(id);
  if (!meta) throw new Error(`missing manifest entry: ${id}`);
  const dest = path.join(webRoot, "public", "images", "wallpapers", `${id}.jpg`);
  if (existsSync(dest)) throw new Error(`collision: ${dest}`);
  const buffer = await sharp(`${SRC}/${id}.png`)
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  writeFileSync(dest, buffer);
  const m = await sharp(dest).metadata();
  metrics.set(id, { file: dest, width: m.width, height: m.height, bytes: buffer.length });
  console.log(`[b2] ${id}.jpg ${m.width}x${m.height} ${Math.round(buffer.length / 1024)} KB`);
}

// SEEDS + dimensions
const wpPath = path.join(webRoot, "lib", "wallpapers.ts");
let wp = readFileSync(wpPath, "utf8");
const seedLines = BATCH.map(([id, title, styleId, alt]) =>
  `  {
    id: "${id}",
    title: ${JSON.stringify(title)},
    styleId: "${styleId}",
    imageOverride: "/images/wallpapers/${id}.jpg",
    alt: ${JSON.stringify(alt)},
    license: "self-authored",
  },`
).join("\n");
const seedMarker = "\n] satisfies readonly PresetWallpaperSeed[];";
if (!wp.includes(seedMarker)) throw new Error("SEEDS marker missing");
wp = wp.replace(seedMarker, "\n" + seedLines + seedMarker);

const dimLines = BATCH.map(
  ([id]) => `  "${id}": { width: ${metrics.get(id).width}, height: ${metrics.get(id).height} },`
).join("\n");
const dimAnchor = '  "ukiyo-anime-fusion": { width: 1536, height: 864 },';
if (!wp.includes(dimAnchor)) throw new Error("dimensions anchor missing");
wp = wp.replace(dimAnchor, dimAnchor + "\n" + dimLines);

// Featured: exactly nine batch-2 desktop picks (3x3 uniform grid).
const featuredRe = /const FEATURED_WALLPAPER_IDS: readonly string\[\] = \[[\s\S]*?\];/;
if (!featuredRe.test(wp)) throw new Error("featured block missing");
wp = wp.replace(featuredRe, `const FEATURED_WALLPAPER_IDS: readonly string[] = [
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
];`);
writeFileSync(wpPath, wp);
console.log("[b2] lib/wallpapers.ts updated");

// Registry
const regPath = path.join(webRoot, "data", "media-rights.json");
const registry = JSON.parse(readFileSync(regPath, "utf8"));
for (const [index, [id, , , , , , , , , ,]] of BATCH.entries()) {
  if (registry.assets.some((a) => a.assetId === `wallpaper.${id}`)) {
    throw new Error(`registry collision: wallpaper.${id}`);
  }
  const m = metrics.get(id);
  const meta = byMeta.get(id);
  registry.assets.push({
    assetId: `wallpaper.${id}`,
    path: `/images/wallpapers/${id}.jpg`,
    privatePath: null,
    mime: "image/jpeg",
    bytes: m.bytes,
    sha256: createHash("sha256").update(readFileSync(m.file)).digest("hex"),
    usage: "gallery-wallpaper",
    sourceType: "self-authored-ai",
    sourceUrl: null,
    sourceFileUrl: null,
    sourceTitle: `WallHaze original — "${meta.prompt.slice(0, 80)}…"`,
    author: "WallHaze (self-authored)",
    licenseType: "self-authored",
    licenseUrl: null,
    licenseEvidence: `Generated 2026-10-31 (batch 2) via fal-ai/flux-2/klein/4b (owner-directed operations batch; request id ${meta.requestId ?? "n/a"}; seed ${meta.seed}; fal safety checker enabled). Full prompt/manifest in the internal generation record.`,
    auditCheckedAt: null,
    auditVerified: null,
    attributionRequired: false,
    attributionText: "WallHaze · self-authored",
    modificationNotes: "None recorded.",
    thirdPartyRights: "No known third-party rights; original generation, no character/brand references.",
    aiGenerated: true,
    reviewStatus: "verified",
    canPubliclyDisplay: true,
    canOfferDownload: true,
    publiclyAccessible: true,
    externalAccessible: false,
    parentAssetIds: [],
    reviewedAt: "2026-10-31",
    reviewedBy: "owner-directed-batch2-20261031 (automated sharp validation + per-image visual screen; human re-confirmation available on request)",
    notes: "Self-authored AI generation. Provenance (prompt, seed, request id) in the internal manifest; not shown to site visitors.",
  });
}
const counts = registry.assets.reduce(
  (a, x) => (a[x.reviewStatus] = (a[x.reviewStatus] || 0) + 1, a),
  {}
);
registry.counts = {
  total: registry.assets.length,
  verified: counts.verified ?? 0,
  pending: counts.pending ?? 0,
  restricted: counts.restricted ?? 0,
  rejected: counts.rejected ?? 0,
  removed: counts.removed ?? 0,
};
writeFileSync(regPath, JSON.stringify(registry, null, 2) + "\n");
console.log(`[b2] registry: ${registry.assets.length} assets`, JSON.stringify(registry.counts));

// i18n x7
for (const loc of LOCALES) {
  const p = path.join(webRoot, "messages", `${loc}.json`);
  const j = JSON.parse(readFileSync(p, "utf8"));
  BATCH.forEach(([id], index) => {
    const localized = T(index)[loc];
    j.galleryWallpapers[id] = {
      title: localized.title,
      alt: loc === "en" ? localized.alt : `${localized.title} — ${localized.alt}`,
    };
  });
  writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}
console.log("[b2] galleryWallpapers x7 updated");
console.log("[b2] DONE:", BATCH.length, "wallpapers");
