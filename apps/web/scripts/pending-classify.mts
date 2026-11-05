import { PRESET_WALLPAPERS } from "../lib/wallpapers.js";
import { MEDIA_RIGHTS } from "../lib/media-rights.js";
const pending = PRESET_WALLPAPERS.filter((w) => w.license === "review-pending" || !w.image);
const byPath = new Map(MEDIA_RIGHTS.map((r) => [r.path, r]));
const cat: Record<string, number> = {};
const unmatched: string[] = [];
for (const w of pending) {
  const rec = byPath.get(w.image || "") ?? MEDIA_RIGHTS.find((r) => r.assetId === `wallpaper.${w.id}`);
  if (!rec) { unmatched.push(`${w.id}|image=${w.image ?? "null"}`); continue; }
  const key = `${rec.sourceType}/${rec.reviewStatus}`;
  cat[key] = (cat[key] ?? 0) + 1;
}
console.log(JSON.stringify(cat));
console.log("unmatched:", unmatched.length, unmatched.slice(0, 8).join(", "));
