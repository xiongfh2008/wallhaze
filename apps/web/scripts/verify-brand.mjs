// One-off brand verification: screenshots of header/footer logo + favicon
// fetch, at desktop and mobile widths. Run: node scripts/verify-brand.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { withHeadlessPage } from "./media/cdp.mjs";

mkdirSync(".screenshots", { recursive: true });
await withHeadlessPage(async ({ call, evaluate }) => {
  for (const [width, height, name, mobile] of [
    [1440, 900, "brand-desktop", false],
    [390, 844, "brand-mobile", true],
  ]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 2, mobile,
    });
    await call("Page.navigate", { url: "https://wallhaze.com/zh" });
    await new Promise((r) => setTimeout(r, 6000));
    const facts = await evaluate(
      "(() => { const img = document.querySelector('header img[alt=\"WallHaze\"]'); if (!img) return { found: false }; const r = img.getBoundingClientRect(); return { found: true, w: Math.round(r.width), h: Math.round(r.height), natural: img.naturalWidth + 'x' + img.naturalHeight, complete: img.complete, ratio: Math.round((r.width / r.height) * 100) / 100 }; })()"
    );
    console.log(name, JSON.stringify(facts));
    const png = await call("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width, height: 220, scale: 1 },
    });
    writeFileSync(`.screenshots/${name}.png`, Buffer.from(png.data, "base64"));
  }
  // Footer capture (scroll to bottom) at desktop.
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 900, deviceScaleFactor: 2, mobile: false,
  });
  await call("Page.navigate", { url: "https://wallhaze.com/zh" });
  await new Promise((r) => setTimeout(r, 6000));
  await evaluate("window.scrollTo(0, document.body.scrollHeight)");
  await new Promise((r) => setTimeout(r, 1500));
  const png = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(".screenshots/brand-footer.png", Buffer.from(png.data, "base64"));
  console.log("BRAND_DONE");
});
