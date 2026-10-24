import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withHeadlessPage } from "./cdp.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const runtime = await readFile(new URL("./page-runtime.js", import.meta.url), "utf8");
await withHeadlessPage(async ({ evaluate }) => {
  await evaluate(runtime);
  const specs = [
    { scene: "abstractLight", seed: 151, width: 1920, height: 1080, time: 2.2, out: "images/wallpapers/light-ribbons-wide.jpg" },
    { scene: "softGradient", seed: 141, width: 1080, height: 1440, time: 0, out: "images/styles/soft-gradient.jpg" },
    { scene: "abstractLight", seed: 152, width: 1200, height: 1600, time: 0, out: "images/styles/abstract-light.jpg" },
  ];
  for (const spec of specs) {
    const base64 = await evaluate(`window.WHMedia.renderStill(${JSON.stringify(spec)})`);
    const path = join(webRoot, "public", spec.out);
    await writeFile(path, Buffer.from(base64, "base64"));
    console.log(path);
  }
});
