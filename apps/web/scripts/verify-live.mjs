// One-off live acceptance: screenshots of https://wallhaze.com homepage
// (new featured wallpapers) + a detail page. Run: node scripts/verify-live.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { withHeadlessPage } from "./media/cdp.mjs";

mkdirSync(".screenshots", { recursive: true });
const shots = [];
await withHeadlessPage(async ({ call, evaluate }) => {
  const targets = [
    ["https://wallhaze.com/zh", "live-home"],
    ["https://wallhaze.com/wallpapers/mecha-girl-neon-city", "live-detail"],
  ];
  for (const [url, name] of targets) {
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await call("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 6000));
    await evaluate(
      `document.querySelector('#featured')?.scrollIntoView({block:'center'}); document.querySelector('main')?.scrollIntoView({block:'start'});`
    );
    await new Promise((r) => setTimeout(r, 1500));
    const shot = await call("Page.captureScreenshot", { format: "png" });
    writeFileSync(`.screenshots/${name}.png`, Buffer.from(shot.data, "base64"));
    const facts = await evaluate(`({
      url: location.href,
      title: document.title,
      featuredNewVisible: ["mecha-girl-neon-city","tokyo-neon-rain-night","starship-ring-planet","gothic-castle-moonlight","sakura-tram-station","highway-sunset-classic-car","dreamcore-floating-room","synthwave-car-sunset"].filter(id => location.href.includes(id) || document.querySelector('a[href*="'+id+'"]')).length,
      modelLeak: /FLUX|Klein|Wan 2\\.2|Kling V3/.test(document.body.innerText) ? "LEAK" : "none",
      pageOverflowPx: document.scrollingElement.scrollWidth - window.innerWidth,
    })`);
    shots.push({ name, ...facts });
  }
});
