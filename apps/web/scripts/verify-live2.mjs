// One-off live acceptance: featured grid at three widths + detail page.
// Run: node scripts/verify-live2.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { withHeadlessPage } from "./media/cdp.mjs";

mkdirSync(".screenshots", { recursive: true });
const shots = [];
await withHeadlessPage(async ({ call, evaluate }) => {
  for (const [width, height, name] of [
    [1440, 900, "grid-desktop"],
    [768, 1024, "grid-tablet"],
    [390, 844, "grid-mobile"],
  ]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 800,
    });
    await call("Page.navigate", { url: "https://wallhaze.com/zh" });
    await new Promise((r) => setTimeout(r, 6000));
    await evaluate(
      `(() => { const el = document.querySelector('#featured'); if (el) { window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70); } })()`
    );
    await new Promise((r) => setTimeout(r, 2500));
    const facts = await evaluate(`(() => {
      const grid = document.querySelector('#featured ul');
      if (!grid) return { found: false };
      const cards = [...grid.querySelectorAll(':scope > li')];
      const ratios = cards.map((c) => {
        const box = c.querySelector('[style*="aspect-ratio"]');
        const r = box.getBoundingClientRect();
        return Math.round((r.width / r.height) * 100) / 100;
      });
      const tops = cards.map((c) => Math.round(c.getBoundingClientRect().top + window.scrollY));
      const rows = [...new Set(tops)].length;
      const scrollbar = document.scrollingElement.scrollWidth - window.innerWidth;
      const shot = {
        cards: cards.length,
        uniformRatio16x9: ratios.every((v) => Math.abs(v - 1.78) < 0.05),
        rowsAligned: rows,
        pageOverflowPx: scrollbar,
        sampleRatio: ratios[0] ?? null,
      };
      return shot;
    })()`);
    const png = await call("Page.captureScreenshot", { format: "png" });
    writeFileSync(`.screenshots/${name}.png`, Buffer.from(png.data, "base64"));
    shots.push({ name, ...facts, scrollY: await evaluate("Math.round(window.scrollY)") });
  }
  console.log(JSON.stringify(shots, null, 1));
  // Detail page for one new piece
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: "https://wallhaze.com/wallpapers/b2-interstellar-gate" });
  await new Promise((r) => setTimeout(r, 6000));
  const detail = await evaluate(`({
    title: document.title,
    downloadHref: document.querySelector('a[href*="b2-interstellar-gate"]')?.getAttribute("href") ?? null,
  })`);
  shots.push({ name: "detail", ...detail });
  const png = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(".screenshots/live-detail-b2.png", Buffer.from(png.data, "base64"));
});
