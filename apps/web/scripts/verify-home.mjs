// One-off visual verification: young-ified homepage (carousel + featured).
// Run: node scripts/verify-home.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { withHeadlessPage } from "./media/cdp.mjs";

mkdirSync(".screenshots", { recursive: true });
const shots = [];
await withHeadlessPage(async ({ call, evaluate }) => {
  for (const [width, height, name] of [
    [1440, 900, "home-desktop"],
    [390, 844, "home-mobile"],
  ]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 800,
    });
    await call("Page.navigate", { url: "http://localhost:3100/zh" });
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const facts = await evaluate(`(async () => {
      const band = document.querySelector('section[aria-label="壁纸风格预览"]');
      band?.scrollIntoView({ block: "center" });
      await new Promise((r) => setTimeout(r, 400));
      const vp = band?.querySelector("div.overflow-x-auto");
      const s0 = vp?.scrollLeft ?? -1;
      await new Promise((r) => setTimeout(r, 2000));
      const s1 = vp?.scrollLeft ?? -1;
      const shot = { scrollDelta: Math.round((s1 - s0) * 10) / 10 };
      const featured = document.getElementById("featured");
      featured?.scrollIntoView({ block: "center" });
      await new Promise((r) => setTimeout(r, 300));
      return shot;
    })()`);
    const shot = await call("Page.captureScreenshot", { format: "png" });
    writeFileSync(`.screenshots/${name}.png`, Buffer.from(shot.data, "base64"));
    shots.push({ name, ...facts });
  }
});
console.log(JSON.stringify(shots, null, 1));
