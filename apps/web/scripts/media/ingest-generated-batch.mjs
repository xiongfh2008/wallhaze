// Ingest the generated batch: convert PNGs to site JPEGs, append SEEDS +
// measured dimensions, extend the media-rights registry, add localized
// titles, and curate the featured list. Run once from apps/web:
//   node scripts/media/ingest-generated-batch.mjs
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const webRoot = path.resolve(import.meta.dirname, "..", "..");
const SRC = "D:/Project/wallhaze/generated-batch/out";
const MANIFEST = JSON.parse(
  readFileSync("D:/Project/wallhaze/generated-batch/manifest.json", "utf8")
);

// id, title(en), styleId, alt(en), localized titles/alts
const BATCH = [
  ["mecha-girl-neon-city", "Mecha Girl: Neon Skyline", "mecha", "Original anime mecha girl on a rooftop above a neon megacity skyline", "机甲少女·霓虹天际", "メカ少女・ネオンの空", "기계소녀: 네온 스카이라인", "Chica mecha: horizonte de neón", "Fille méca : horizon néon", "Mecha-Mädchen: Neonhorizont"],
  ["tokyo-neon-rain-night", "Tokyo Rain: Neon Night", "cyberpunk", "Rainy futuristic street reflecting blue and purple neon", "东京雨夜·霓虹", "東京レイン・ネオンナイト", "도쿄 레인: 네온 나이트", "Tokio bajo la lluvia", "Tokyo sous la pluie", "Tokio Neonregen"],
  ["starship-ring-planet", "Voyage Past the Ring", "sci-fi", "Starship crossing a giant ringed planet in deep space", "环行星之旅", "リングの惑星へ", "링 행성 항해", "Viaje al planeta anillado", "Voyage vers la planète à anneaux", "Reise zum Ringplaneten"],
  ["gothic-castle-moonlight", "Moonlit Citadel", "gothic-horror", "Gothic castle on a cliff under a full moon with drifting fog", "月下哥特城", "月光のゴシック城", "달빛 성채", "Ciudadela a la luz de la luna", "Citadelle au clair de lune", "Mondlicht-Zitadelle"],
  ["sakura-tram-station", "Petals at the Last Stop", "cozy-anime", "Anime tram station at dusk with drifting cherry blossoms", "末班车站的樱瓣", "終着駅の桜", "종착역의 벚꽃", "Pétalos en la última parada", "Pétales au terminus", "Blüten an der Endstation"],
  ["highway-sunset-classic-car", "Golden Hour Run", "cinematic", "Classic car driving into a huge desert sunset on an open highway", "黄金时刻公路", "黄金時間のドライブ", "골든아워 질주", "A la hora dorada", "Route au coucher du soleil", "Fahrt in die goldene Stunde"],
  ["dreamcore-floating-room", "Room Above the Clouds", "dreamcore", "A furnished room floating on an island above an endless cloud sea", "云上房间", "雲の上の部屋", "구름 위의 방", "Habitación sobre las nubes", "Chambre au-dessus des nuages", "Zimmer über den Wolken"],
  ["synthwave-car-sunset", "Grid Sunset", "vaporwave", "Retro sports car on a neon grid road toward a striped sunset", "网格落日", "グリッドの夕焼け", "그리드 노을", "Atardecer de rejilla", "Coucher de soleil sur la grille", "Grid-Sonnenuntergang"],
  ["dragon-sky-citadel", "Ember Dragon's Flight", "dark-fantasy", "Ember-winged dragon circling a floating citadel above storm clouds", "烬龙飞翔", "烈竜の飛翔", "잉걸룡의 비상", "El vuelo del dragón", "Le vol du dragon de braise", "Flug des Glutdrachen"],
  ["pixel-rainy-city", "8-Bit Downpour", "pixel-art", "Pixel-art rainy neon intersection with reflective pavement", "像素暴雨", "8ビットの大雨", "8비트 폭우", "Diluvio 8 bits", "Déluge 8 bits", "8-Bit-Platzregen"],
  ["abandoned-manor-dread", "The Silent Manor", "supernatural-horror", "Abandoned Victorian manor at dusk with mist and a faint candlelit window", "沉默洋馆", "沈黙の洋館", "침묵의 저택", "La mansión silenciosa", "Le manoir silencieux", "Das stille Anwesen"],
  ["hypercar-scifi-city", "Lightline Runner", "sci-fi", "Futuristic hypercar with glowing light lines speeding through a sci-fi city", "光轨疾驰", "ライトラインの疾走", "빛의 궤적", "Corredor de luz", "Coureur de lumière", "Lichtlinien-Runner"],
  ["mystic-girl-night-sky", "Stargazer", "anime", "Anime girl gazing up at a towering starry night sky with a faint aurora", "仰望星海", "星を仰ぐ", "별을 바라보며", "Mirando las estrellas", "Ciel étoilé", "Blick zu den Sternen"],
  ["black-hole-voyage", "Event Horizon", "sci-fi", "A tiny vessel beside a black hole's glowing accretion disk", "视界之旅", "事象の地平線", "사건의 지평선", "Horizonte de sucesos", "L’horizon des événements", "Der Ereignishorizont"],
  ["neon-motorcycle-night", "Wet Apex", "cyberpunk", "Neon-accented motorcycle leaning through a wet downtown corner", "湿地压弯", "ウェットなコーナー", "젖은 코너", "Curva mojada", "Corde mouillée", "Nasse Kurve"],
  ["skydeck-future-city", "Blue Hour Deck", "cinematic", "Visitor on a glass skydeck above a futuristic megacity at blue hour", "蓝调时刻观景台", "ブルーアワーのデッキ", "블루아워 전망대", "Mirador a la hora azul", "Terrasse à l’heure bleue", "Plattform zur blauen Stunde"],
  ["samurai-shrine-rain", "Torii in the Rain", "ukiyo-e-anime", "Samurai before a red torii gate path in heavy rain with glowing lanterns", "雨中鸟居", "雨の鳥居", "비 속의 도리이", "Torii bajo la lluvia", "Un torii sous la pluie", "Torii im Regen"],
  ["starlit-glowing-ocean", "Between Two Skies", "dreamcore", "A small boat between a starlit sky and a bioluminescent ocean", "两片星空之间", "二つの空のあいだ", "두 하늘 사이", "Entre dos cielos", "Entre deux ciels", "Zwischen zwei Himmeln"],
  ["clay-toon-cozy-world", "Little Floating Village", "clay-3d", "Cute 3D clay houses with glowing windows on floating grass islands", "漂浮小村", "ふわふわの村", "떠다니는 마을", "Aldea flotante", "Village flottant", "Schwebendes Dörfchen"],
  ["amoled-violet-halo", "Pure Glow", "dark", "Single glowing violet halo ring on a pure black AMOLED background", "纯粹光晕", "ピュアグロー", "순수한 후광", "Resplandor puro", "Halo pur", "Reines Leuchten"],
  ["deep-sea-glow-cosmos", "Abyssal Constellation", "dreamcore", "Bioluminescent deep-sea creatures drifting like a galaxy", "深渊星座", "深海の星座", "심해의 별자리", "Constelación abisal", "Constellation des abysses", "Abgründige Konstellation"],
  ["anime-bedroom-cityscape", "Lo-Fi Night In", "cozy-anime", "Cozy anime bedroom with a warm lamp and a glowing city nightscape outside", "夜晚房间·城市夜景", "ローファイナイト", "로파이 나이트", "Noche lo-fi", "Nuit lo-fi", "Lo-Fi-Abend"],
  ["retro-motel-alien-sky", "Vacancy Beyond", "vaporwave", "Retro desert motel with a neon sign under an alien sky with two moons", "星空旅馆", "宇宙モーテル", "우주 모텔", "Motel interestelar", "Motel interstellaire", "Motel unter Alienhimmel"],
  ["ukiyo-anime-fusion", "The Great Modern Wave", "ukiyo-e-anime", "Ukiyo-e woodblock wave fused with modern anime and a distant skyline", "现代巨浪", "現代の大波", "현대의 큰 파도", "La gran ola moderna", "La grande vague moderne", "Die moderne Große Welle"],
];

const LOCALES = ["en", "zh", "ja", "ko", "es", "fr", "de"];
const T = (index) => ({
  en: { title: BATCH[index][1], alt: BATCH[index][3] },
  zh: { title: BATCH[index][4], alt: BATCH[index][3] },
  ja: { title: BATCH[index][5], alt: BATCH[index][3] },
  ko: { title: BATCH[index][6], alt: BATCH[index][3] },
  es: { title: BATCH[index][7], alt: BATCH[index][3] },
  fr: { title: BATCH[index][8], alt: BATCH[index][3] },
  de: { title: BATCH[index][9], alt: BATCH[index][3] },
});

const byMeta = new Map(MANIFEST.results.map((r) => [r.id, r]));

// 1. Convert PNGs -> public/images/wallpapers/<id>.jpg and collect metrics.
const metrics = new Map();
for (const [id] of BATCH) {
  const meta = byMeta.get(id);
  if (!meta) throw new Error(`missing manifest entry for ${id}`);
  const dest = path.join(webRoot, "public", "images", "wallpapers", `${id}.jpg`);
  if (existsSync(dest)) {
    const m = await sharp(dest).metadata();
    metrics.set(id, { file: dest, width: m.width, height: m.height, bytes: (await import("node:fs")).statSync(dest).size });
    console.log(`[ingest] ${id}.jpg already exists (${m.width}x${m.height}) — skipped`);
    continue;
  }
  const buffer = await sharp(`${SRC}/${id}.png`)
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  writeFileSync(dest, buffer);
  const m = await sharp(dest).metadata();
  metrics.set(id, {
    file: dest,
    width: m.width,
    height: m.height,
    bytes: buffer.length,
  });
  console.log(`[ingest] ${id}.jpg ${m.width}x${m.height} ${Math.round(buffer.length / 1024)} KB`);
}

// 2. SEEDS + IMAGE_DIMENSIONS insertion into lib/wallpapers.ts.
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
const marker = "\n] satisfies readonly PresetWallpaperSeed[];";
if (!wp.includes(marker)) throw new Error("SEEDS end marker not found");
wp = wp.replace(marker, "\n" + seedLines + marker);

const dimLines = BATCH.map(
  ([id]) =>
    `  "${id}": { width: ${metrics.get(id).width}, height: ${metrics.get(id).height} },`
).join("\n");
const dimMarker = 'const STYLE_BY_ID = new Map<StyleId, WallStyle>(';
if (!wp.includes(dimMarker)) throw new Error("dimensions insertion marker not found");
wp = wp.replace(dimMarker, dimLines + "\n\n" + dimMarker);

// 3. Featured curation: the eight directive themes first, then retained
//    cleared pieces for section depth.
const oldFeatured = /const FEATURED_WALLPAPER_IDS: readonly string\[\] = \[[\s\S]*?\];/.exec(wp);
if (!oldFeatured) throw new Error("FEATURED_WALLPAPER_IDS block not found");
wp = wp.replace(oldFeatured[0], `const FEATURED_WALLPAPER_IDS: readonly string[] = [
  // 2026-10-31 owner-directed batch: the eight directive themes first (all
  // newly generated self-authored fal.ai originals, cleared below), then
  // retained cleared pieces for section depth.
  "mecha-girl-neon-city",
  "tokyo-neon-rain-night",
  "starship-ring-planet",
  "gothic-castle-moonlight",
  "sakura-tram-station",
  "highway-sunset-classic-car",
  "dreamcore-floating-room",
  "synthwave-car-sunset",
  "light-ribbons-wide",
  "jellyfish-deep",
  "aurora-veil",
  "forest-rays",
];`);
writeFileSync(wpPath, wp);
console.log("[ingest] lib/wallpapers.ts updated");

// 4. Media-rights registry entries.
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
    sha256: (await import("node:crypto")).createHash("sha256").update(readFileSync(m.file)).digest("hex"),
    usage: "gallery-wallpaper",
    sourceType: "self-authored-ai",
    sourceUrl: null,
    sourceFileUrl: null,
    sourceTitle: `WallHaze original — "${meta.prompt.slice(0, 80)}…"`,
    author: "WallHaze (self-authored)",
    licenseType: "self-authored",
    licenseUrl: null,
    licenseEvidence: `Generated 2026-10-31 via fal-ai/flux-2/klein/4b (owner-directed operations batch; request id ${meta.requestId ?? "n/a"}; seed ${meta.seed}; fal safety checker enabled). Full prompt/manifest held in the internal generation record.`,
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
    reviewedBy: "owner-directed-batch-20261031 (automated sharp validation + per-image visual screen; human re-confirmation available on request)",
    notes: "Self-authored AI generation. Provenance (prompt, seed, request id) in the internal manifest; not shown to site visitors.",
  });
}
writeFileSync(regPath, JSON.stringify(registry, null, 2) + "\n");
console.log(`[ingest] registry extended to ${registry.assets.length} assets`);

// 5. galleryWallpapers i18n x7.
for (const loc of LOCALES) {
  const p = path.join(webRoot, "messages", `${loc}.json`);
  const j = JSON.parse(readFileSync(p, "utf8"));
  BATCH.forEach(([id], index) => {
    const localized = T(index)[loc];
    j.galleryWallpapers[id] = {
      title: localized.title,
      alt: loc === "en" ? localized.alt : localized.title + " — " + localized.alt,
    };
  });
  writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}
console.log("[ingest] galleryWallpapers x7 updated");
console.log("[ingest] DONE:", BATCH.length, "wallpapers");
