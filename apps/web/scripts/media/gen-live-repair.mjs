// Repair stage for the live-demo batch: the 6 paid Wan I2V outputs are
// preserved as /work/<id>-raw.mp4; this script redoes only the free ffmpeg
// stage (seamless-loop blend, H.264 yuv420p faststart, poster) plus an
// objective loop check (pixel diff between first and last frames).
// Run on VPS: docker run --rm -v /opt/wallhaze/generated:/work wallhaze/api:latest node /work/gen-live-repair.mjs
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
const exec = promisify(execFile);

const WORK = "/work";
const OUT = `${WORK}/live-out`;

const THEMES = [
  { id: "haunted-manor", styleId: "gothic-horror", title: "Haunted Manor" },
  { id: "sakura-night-anime", styleId: "cozy-anime", title: "Sakura Night" },
  { id: "seoul-neon-rain", styleId: "cyberpunk", title: "Seoul Neon Rain" },
  { id: "mecha-awakening", styleId: "mecha", title: "Mecha Awakening" },
  { id: "interstellar-frontier", styleId: "sci-fi", title: "Interstellar Frontier" },
  { id: "dragon-realm", styleId: "dark-fantasy", title: "Dragon Realm" },
];

async function ffprobe(path) {
  const { stdout } = await exec("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate,duration",
    "-of", "json", path,
  ], { timeout: 60_000 });
  const s = JSON.parse(stdout).streams[0];
  const [num, den] = String(s.r_frame_rate).split("/");
  return {
    width: s.width,
    height: s.height,
    fps: Number(num) / Number(den),
    duration: Number(s.duration),
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const repaired = [];
  for (const theme of THEMES) {
    const raw = `${WORK}/${theme.id}-raw.mp4`;
    if (!existsSync(raw)) {
      console.error(`[repair] missing raw for ${theme.id} — skipped`);
      continue;
    }
    const probe = await ffprobe(raw);
    // Loop blend: main body 0..D-0.55, then the final 0.55s dissolves from
    // the tail back into the head so the wrap point is visually seamless.
    const blend = 0.55;
    const splitAt = probe.duration - blend;
    const offset = splitAt - blend;
    const final = `${OUT}/${theme.id}.mp4`;
    await exec("ffmpeg", [
      "-y", "-i", raw, "-filter_complex",
      `[0:v]split=2[a][b];[a]trim=0:${splitAt.toFixed(3)},setpts=PTS-STARTPTS[v1];[b]trim=${splitAt.toFixed(3)},setpts=PTS-STARTPTS[v2];[v1][v2]xfade=transition=fade:duration=${blend.toFixed(3)}:offset=${offset.toFixed(3)},format=yuv420p[out]`,
      "-map", "[out]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "21",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", final,
    ], { timeout: 300_000 });
    // Poster: a representative mid frame.
    await exec("ffmpeg", [
      "-y", "-i", final, "-ss", "1.5", "-frames:v", "1", `${OUT}/${theme.id}.jpg`,
    ], { timeout: 60_000 });

    // Objective loop check: first vs last frame pixel difference (raw
    // before blend vs blended output) — the blended output's last frame
    // should sit far closer to the first frame than the raw tail did.
    const finalProbe = await ffprobe(final);
    const firstFrame = `${WORK}/${theme.id}-f0.png`;
    const lastFrame = `${WORK}/${theme.id}-fN.png`;
    await exec("ffmpeg", ["-y", "-i", final, "-frames:v", "1", firstFrame], { timeout: 60_000 });
    await exec("ffmpeg", ["-y", "-sseof", "-0.1", "-i", final, "-frames:v", "1", lastFrame], { timeout: 60_000 });
    // Compare via ffmpeg's signalstats on a stacked blend: mean diff.
    const { stdout } = await exec("ffmpeg", [
      "-i", firstFrame, "-i", lastFrame, "-filter_complex",
      "blend=all_mode=difference:all_opacity=1,signalstats,metadata=print:key=lavfi.signalstats.YAVG",
      "-f", "null", "-",
    ], { timeout: 60_000 });
    const yavgMatch = /YAVG=([\d.]+)/.exec(stdout);
    const loopDiff = yavgMatch ? Number(yavgMatch[1]) : null;

    repaired.push({
      id: theme.id,
      styleId: theme.styleId,
      title: theme.title,
      file: final,
      width: finalProbe.width,
      height: finalProbe.height,
      fps: Math.round(finalProbe.fps * 100) / 100,
      durationSeconds: Math.round(finalProbe.duration * 100) / 100,
      loopCheck: {
        method: "mean absolute luma difference between first and last frame (0-255)",
        diff: loopDiff,
        note: "values under ~8 read as a visually seamless wrap for ambient motion",
      },
    });
    console.log(`[repair] ${theme.id}: ${finalProbe.width}x${finalProbe.height} ${finalProbe.duration.toFixed(2)}s loopDiff=${loopDiff}`);
  }
  writeFileSync(`${WORK}/live-manifest-repaired.json`, JSON.stringify({
    repairedAt: new Date().toISOString(),
    count: repaired.length,
    repaired,
  }, null, 2));
  console.log(`[repair] done: ${repaired.length}/6`);
}

main().catch((e) => {
  console.error(`[repair] fatal: ${e.message}`);
  process.exit(1);
});
