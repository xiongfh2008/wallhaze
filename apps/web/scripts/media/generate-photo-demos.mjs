import { readFile, writeFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withHeadlessPage } from "./cdp.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const publicRoot = join(webRoot, "public");
const runtime = await readFile(new URL("./page-runtime.js", import.meta.url), "utf8");

const demos = [
  { id: "night-sakura", frame: "night-sakura-frame.jpg", width: 720, height: 1280, effect: "sakura", tint: ["rgba(24,8,54,0.24)", "rgba(75,24,72,0.08)", "rgba(7,2,16,0.3)"], posterTime: 2.1 },
  { id: "neon-rain", frame: "neon-rain-frame.jpg", width: 720, height: 1280, effect: "neon", tint: ["rgba(5,2,28,0.22)", "rgba(25,5,50,0.06)", "rgba(3,1,10,0.34)"], posterTime: 2.3 },
  { id: "star-drift", frame: "star-drift-frame.jpg", width: 1280, height: 720, effect: "stars", tint: ["rgba(6,3,24,0.14)", "rgba(0,0,0,0)", "rgba(2,1,8,0.24)"], posterTime: 2.2 },
  { id: "jellyfish-glow", frame: "jellyfish-glow-frame.jpg", width: 1024, height: 1024, effect: "ocean", tint: ["rgba(2,18,38,0.14)", "rgba(0,0,0,0)", "rgba(1,4,14,0.3)"], posterTime: 2.5 },
  { id: "aurora-veil", frame: "aurora-veil-frame.jpg", width: 1280, height: 720, effect: "aurora", tint: ["rgba(5,16,36,0.12)", "rgba(0,0,0,0)", "rgba(2,5,14,0.26)"], posterTime: 2.3 },
  { id: "sunset-station", frame: "sunset-station-frame.jpg", width: 1280, height: 720, effect: "leaves", tint: ["rgba(38,14,32,0.1)", "rgba(255,170,100,0.03)", "rgba(12,4,16,0.28)"], posterTime: 2.4 },
  { id: "forest-light", frame: "forest-light-frame.jpg", width: 1280, height: 720, effect: "forest", tint: ["rgba(4,18,12,0.14)", "rgba(30,60,30,0.02)", "rgba(2,8,5,0.28)"], posterTime: 2.3 },
  { id: "flower-field", frame: "flower-field-frame.jpg", width: 720, height: 1280, effect: "flowers", tint: ["rgba(32,10,36,0.16)", "rgba(90,30,60,0.04)", "rgba(10,3,14,0.28)"], posterTime: 2.2 },
];

await withHeadlessPage(async ({ evaluate }) => {
  await evaluate(runtime);
  const summary = [];
  for (const demo of demos) {
    const frameBytes = await readFile(join(publicRoot, "videos", "live-demos", demo.frame));
    const dataUrl = `data:image/jpeg;base64,${frameBytes.toString("base64")}`;
    await evaluate(`window.WHPhoto.setFrame(${JSON.stringify(dataUrl)})`);
    const result = await evaluate(
      `window.WHPhoto.renderPhotoVideo(${JSON.stringify({ ...demo, duration: 5, fps: 30, bitrate: 7_000_000, seed: 808 })})`
    );
    const videoPath = join(publicRoot, "videos", "live-demos", `${demo.id}.mp4`);
    await writeFile(videoPath, Buffer.from(result.base64, "base64"));
    const poster = await evaluate(
      `window.WHPhoto.renderPhotoPoster(${JSON.stringify({ ...demo, duration: 5, seed: 808 })})`
    );
    const posterPath = join(publicRoot, "videos", "live-demos", `${demo.id}.jpg`);
    await writeFile(posterPath, Buffer.from(poster, "base64"));
    const info = await stat(videoPath);
    const posterInfo = await stat(posterPath);
    summary.push({ ...demo, videoPath, posterPath, bytes: info.size, posterBytes: posterInfo.size, mime: result.mime, durationSeconds: result.durationSeconds });
    console.log(`video ${demo.id} ${info.size} bytes poster ${posterInfo.size}`);
  }
  await writeFile(
    join(webRoot, "scripts", "media", "generated-demos.json"),
    `${JSON.stringify(summary, null, 2)}\n`
  );
});
