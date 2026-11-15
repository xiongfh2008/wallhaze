// Import 3 user-provided AI wallpapers (owner release 2026-11-15):
// convert PNG originals (archived under private-media/incoming-review/) to
// site JPEGs at public/images/wallpapers/<slug>.jpg (sharp q90 mozjpeg,
// per ingest-generated-batch.mjs convention). Originals preserved untouched.
import { writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const webRoot = path.resolve(import.meta.dirname, "..", "..");
const SRC = path.join(webRoot, "private-media", "incoming-review");
const OUT = path.join(webRoot, "public", "images", "wallpapers");

const ITEMS = [
  { slug: "sunny-headphones-smile" },
  { slug: "seaside-daydream-boy" },
  { slug: "adventure-goggles-cat" },
];

for (const { slug } of ITEMS) {
  const src = path.join(SRC, `${slug}.png`);
  const dest = path.join(OUT, `${slug}.jpg`);
  const buf = await sharp(src).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(dest, buf);
  const meta = await sharp(dest).metadata();
  const kb = Math.round(buf.length / 1024);
  console.log(`${slug}.jpg: ${meta.width}x${meta.height} ${kb}KB`);
}
console.log("done");
