import { PRESET_WALLPAPERS } from "../lib/wallpapers.js";
import { MEDIA_RIGHTS } from "../lib/media-rights.js";
const byPath = new Map(MEDIA_RIGHTS.map((r) => [r.path, r]));
const stats: Record<string, number> = {};
const misses: string[] = [];
for (const w of PRESET_WALLPAPERS as any[]) {
  if (w.license === "review-pending" || !w.image) continue;
  if (w.source) { stats["cc0"] = (stats["cc0"] ?? 0) + 1; continue; }
  const rec = byPath.get(w.image);
  if (!rec) { misses.push(`${w.id}:${w.image}`); continue; }
  const key = `ai=${rec.aiGenerated}/${rec.reviewStatus}`;
  stats[key] = (stats[key] ?? 0) + 1;
}
console.log(JSON.stringify(stats));
console.log("registry-misses:", misses.length, misses.slice(0, 6).join(", "));
