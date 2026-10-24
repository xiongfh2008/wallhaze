import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withHeadlessPage } from "./cdp.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outRoot = join(webRoot, "..", "..", "docs", "codex", "screenshots", "gallery-quality-upgrade", "video-frames");
await mkdir(outRoot, { recursive: true });
const demos = [
  "night-sakura",
  "neon-rain",
  "star-drift",
  "jellyfish-glow",
  "aurora-veil",
  "sunset-station",
  "forest-light",
  "flower-field",
];

await withHeadlessPage(async ({ evaluate, call }) => {
  await call("Page.navigate", { url: "http://localhost:3100/zh/wallpapers" });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const audit = [];
  for (const id of demos) {
    const result = await evaluate(`(async () => {
      const url = "/videos/live-demos/${id}.mp4";
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      video.playsInline = true;
      video.src = url;
      document.body.appendChild(video);
      await new Promise((resolve, reject) => {
        video.addEventListener("loadedmetadata", resolve, { once: true });
        video.addEventListener("error", reject, { once: true });
      });
      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration = video.duration;
      const times = [0.05, 1.25, 2.45, 3.65, 4.9];
      const frames = [];
      for (const t of times) {
        await new Promise((resolve) => {
          const onSeeked = () => resolve();
          video.addEventListener("seeked", onSeeked, { once: true });
          video.currentTime = Math.min(t, Math.max(0, duration - 0.02));
        });
        await new Promise((resolve) => setTimeout(resolve, 80));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(video, 0, 0, width, height);
        frames.push(canvas.toDataURL("image/jpeg", 0.88).split(",")[1]);
      }
      video.remove();
      return { width, height, duration, frames };
    })()`);
    for (let i = 0; i < result.frames.length; i += 1) {
      await writeFile(
        join(outRoot, `${id}-${i}.jpg`),
        Buffer.from(result.frames[i], "base64")
      );
    }
    audit.push({
      id,
      width: result.width,
      height: result.height,
      duration: result.duration,
      frameFiles: result.frames.map((_, i) => `${id}-${i}.jpg`),
    });
    console.log(id, result.width, result.height, result.duration);
  }
  await writeFile(
    join(outRoot, "video-audit.json"),
    `${JSON.stringify(audit, null, 2)}\n`
  );
});
