import { PRESET_WALLPAPERS } from "../lib/wallpapers.js";
const list = PRESET_WALLPAPERS as any[];
let withImage = 0, pending = 0, source = 0, selfAuth = 0, noLicenseUrl = 0, displayOnly = 0, pendingIds: string[] = [];
for (const w of list) {
  if (w.license === "review-pending" || !w.image) { pending++; pendingIds.push(w.id); continue; }
  withImage++;
  if (w.source) source++; else if (w.license === "self-authored") selfAuth++;
  if (w.source && !w.source.licenseUrl) noLicenseUrl++;
  if (w.displayOnly) displayOnly++;
}
console.log(JSON.stringify({ total: list.length, publicWithImage: withImage, hiddenOrPending: pending, cc0WithSource: source, selfAuthored: selfAuth, sourceMissingLicenseUrl: noLicenseUrl, displayOnly }, null, 1));
console.log("pending:", pendingIds.slice(0, 40).join(","));
