import { PRESET_WALLPAPERS, type PresetWallpaper } from "../lib/wallpapers.js";
const list: readonly PresetWallpaper[] = PRESET_WALLPAPERS;
let withImage = 0, pending = 0, source = 0, selfAuth = 0, noLicenseUrl = 0;
const pendingIds: string[] = [];
for (const w of list) {
  if (w.license === "review-pending" || !w.image) { pending++; pendingIds.push(w.id); continue; }
  withImage++;
  if (w.source) source++; else if (w.license === "self-authored") selfAuth++;
  if (w.source && !w.source.licenseUrl) noLicenseUrl++;
}
console.log(JSON.stringify({ total: list.length, publicWithImage: withImage, hiddenOrPending: pending, cc0WithSource: source, selfAuthored: selfAuth, sourceMissingLicenseUrl: noLicenseUrl }, null, 1));
console.log("pending:", pendingIds.slice(0, 40).join(","));
