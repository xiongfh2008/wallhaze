import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const webRoot = path.resolve(process.cwd(), "apps/web");
const root = path.resolve(process.cwd());
const photos = JSON.parse(
  await readFile(path.join(webRoot, "scripts/media/photo-manifest.json"), "utf8")
);
const demos = JSON.parse(
  await readFile(path.join(webRoot, "scripts/media/generated-demos.json"), "utf8")
);
const sourceForDemo = {
  "night-sakura": "sakura2",
  "neon-rain": "hongkong2",
  "star-drift": "carina",
  "jellyfish-glow": "jelly2",
  "aurora-veil": "aurora2",
  "sunset-station": "train1",
  "forest-light": "forest2",
  "flower-field": "poppy",
};
const byKey = new Map();
for (const item of photos) {
  if (!byKey.has(item.key)) byKey.set(item.key, item);
}
const bytes = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const deviceOf = (width, height) => (width === height ? "tablet" : width > height ? "desktop" : "phone");
const demoRows = demos
  .map((demo) => {
    const source = byKey.get(sourceForDemo[demo.id]);
    return `| ${demo.id} | ${source.sourceTitle} | ${source.author} | CC0 | ${demo.width}×${demo.height} | ${demo.durationSeconds}s | ${bytes(demo.bytes)} | ${demo.videoPath.split("public")[1].replaceAll("\\", "/")} |`;
  })
  .join("\n");
const sourceRows = [...byKey.values()]
  .map(
    (item) =>
      `| ${item.key} | ${item.sourceTitle} | ${item.author} | ${item.license} | ${item.output} | ${item.outputWidth}×${item.outputHeight} | [Commons](<${item.sourcePage}>) |`
  )
  .join("\n");

const doc = `# WallHaze licensed media sources

This file is the traceable source record for the eight motion demos and the
new tablet/desktop gallery wallpapers added in the 2026-10-24 quality pass.
All source photographs are **CC0** (public-domain dedication) from Wikimedia
Commons; the abstract "Soft Gradient" and "Light Ribbons" assets are original
procedural canvas art created for WallHaze.

Nothing in this pass is AI-generated. No paid image/video model was called.
No third-party asset without a recorded CC0/public-domain dedication was added.

## Motion demos

Each demo is a real 5-second, silent H.264 MP4 rendered locally from a licensed
CC0 still plus animated camera drift and particles/rain/petals/light. Posters
are local JPEG renders. The MP4 containers are fragmented MediaRecorder output,
so their \`mvhd\` duration may be absent; the browser reports 5 seconds.

| ID | Source photo | Author | License | Resolution | Duration | Size | File |
|---|---|---|---|---|---|---|---|
${demoRows}

| ID | Poster | Encoding | Devices | Production |
|---|---|---|---|---|
${demos
  .map(
    (demo) =>
      `| ${demo.id} | ${demo.posterPath.split("public")[1].replaceAll("\\", "/")} | MP4 / H.264 / no audio | ${deviceOf(demo.width, demo.height)} | local camera drift + ${demo.effect} overlays |`
  )
  .join("\n")}

## Tablet and desktop wallpapers

New gallery entries: **9 tablet-native 3:4** and **9 desktop-native 16:9**
files (18 total). Each file is a real crop of the source image, never a
stretched or padded fake variant. The original pixel dimensions and output
crop are recorded in \`apps/web/scripts/media/photo-manifest.json\`.

| Source key | Commons file | Author | License | Local file | Output | Source page |
|---|---|---|---|---|---|---|
${sourceRows}

The following local files are original procedural canvas artwork by this
project and are marked \`self-authored\` in the wallpaper data:

- \`/images/styles/soft-gradient.jpg\` (1080×1440), used by the Soft Gradient style and the \`soft-horizon\` tablet wallpaper
- \`/images/wallpapers/light-ribbons-wide.jpg\` (1920×1080)

## Licensing status in the product

- The original 39 gallery entries remain \`review-pending\`; no commercial
  license is asserted for them.
- The 16 new photo wallpapers are marked \`verified\` only because every source
  is CC0 and traceable above. The detail page shows the source page, author and
  license.
- The two procedural additions are marked \`self-authored\`.
- User-generated media is separate: 30-day cloud retention and private signed
  URLs; it is never auto-published to Gallery.

## Themes intentionally not shipped

- **Magic floating islands / 魔法浮岛**: no licensed, high-quality source was
  found for a convincing result. A low-quality procedural placeholder was
  rejected; this theme needs an approved real AI video test.
- **Anime school-life / 四季风景 style previews**: no credible licensed
  anime/school or four-season preview was available. Existing \`cozy-anime\`,
  \`anime-fantasy\`, \`nature\` and \`four-seasons\`-adjacent styles remain
  available; no misleading photo was labelled as anime output.

The eight delivered demos cover sakura, neon rain, deep space, jellyfish,
aurora, sunset station, forest light and flower field with licensed photos and
local motion. This is deliberately a quality-first subset plus substitutions,
not a claim that all eight originally proposed themes were completed.
`;

await writeFile(path.join(root, "docs/codex/MEDIA-SOURCES.md"), doc, "utf8");
console.log("wrote docs/codex/MEDIA-SOURCES.md");
