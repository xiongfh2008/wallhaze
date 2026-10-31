// One-off visible-content audit for the Waffo remediation: what a visitor
// actually SEES on each page (rendered text, not JSON payload).
// Run: node scripts/verify-audit.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { withHeadlessPage } from "./media/cdp.mjs";

mkdirSync(".screenshots", { recursive: true });
const shots = [];
await withHeadlessPage(async ({ call, evaluate }) => {
  for (const [url, name] of [
    ["https://wallhaze.com/zh", "home"],
    ["https://wallhaze.com/zh/terms", "terms"],
    ["https://wallhaze.com/zh/privacy", "privacy"],
    ["https://wallhaze.com/zh/studio", "studio"],
    ["https://wallhaze.com/zh/pricing", "pricing"],
    ["https://wallhaze.com/zh/faq", "faq"],
    ["https://wallhaze.com/zh/help", "help"],
    ["https://wallhaze.com/zh/about", "about"],
  ]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await call("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 6000));
    const text = await evaluate("document.body.innerText");
    const genBtns = await evaluate(
      "Array.from(document.querySelectorAll('button')).filter(function(b){ return b.textContent.indexOf('生成') !== -1 || b.textContent.indexOf('Generate') !== -1; }).length"
    );
    const facts = {
      url,
      hasComingSoon: text.indexOf("即将开放") !== -1 || text.toLowerCase().indexOf("coming soon") !== -1,
      hasOldGmail: text.indexOf("xiongfh2000") !== -1,
      generateButtons: genBtns,
      modelLeak: /FLUX|Klein|Wan 2\.2|Kling V3/.test(text) ? "LEAK" : "none",
      overflow: await evaluate("document.scrollingElement.scrollWidth - window.innerWidth"),
    };
    shots.push({ name, ...facts });
    const png = await call("Page.captureScreenshot", { format: "png" });
    writeFileSync(`.screenshots/audit-${name}.png`, Buffer.from(png.data, "base64"));
    console.log(name, JSON.stringify(facts));
  }
  console.log("AUDIT_DONE");
});
