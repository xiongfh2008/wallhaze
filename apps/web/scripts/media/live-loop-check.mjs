// Loop check for the 6 live demos: extract first/last frame, compute the
// mean absolute luma difference via ffmpeg blend+signalstats (stderr), and
// build a wrap-contact-sheet (first frame | last frame | mid frame) per
// video for visual loop verification. Run on VPS:
//   docker run --rm -v /opt/wallhaze/generated:/work wallhaze/api:latest node /work/loop-check.mjs
import { execFile } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
const exec = promisify(execFile);

const OUT = "/work/live-out";
const ids = readdirSync(OUT).filter((f) => f.endsWith(".mp4")).map((f) => f.replace(".mp4", ""));

const report = [];
for (const id of ids) {
  const mp4 = `${OUT}/${id}.mp4`;
  const f0 = `${OUT}/../chk/${id}-f0.png`;
  const fN = `${OUT}/../chk/${id}-fN.png`;
  const mid = `${OUT}/../chk/${id}-mid.png`;
  if (!existsSync(f0)) {
    await exec("ffmpeg", ["-y", "-i", mp4, "-frames:v", "1", f0], { timeout: 60_000 });
    await exec("ffmpeg", ["-y", "-sseof", "-0.15", "-i", mp4, "-frames:v", "1", fN], { timeout: 60_000 });
    await exec("ffmpeg", ["-y", "-ss", "2", "-i", mp4, "-frames:v", "1", mid], { timeout: 60_000 });
  }
  // Mean absolute luma diff between first and last frames (stderr output).
  let diff = null;
  try {
    const { stderr } = await exec("ffmpeg", [
      "-i", f0, "-i", fN, "-filter_complex",
      "blend=all_mode=difference:all_opacity=1,signalstats,metadata=print:key=lavfi.signalstats.YAVG",
      "-f", "null", "-",
    ], { timeout: 60_000 });
    const m = /YAVG=([\d.]+)/.exec(stderr);
    diff = m ? Number(m[1]) : null;
  } catch (e) {
    const m = /YAVG=([\d.]+)/.exec(e.stderr ?? "");
    diff = m ? Number(m[1]) : null;
  }
  // Duration + probe
  const { stdout } = await exec("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,duration:format=duration",
    "-of", "json", mp4,
  ], { timeout: 60_000 });
  const j = JSON.parse(stdout);
  report.push({
    id,
    width: j.streams[0].width,
    height: j.streams[0].height,
    duration: Math.round(Number(j.format.duration) * 100) / 100,
    loopDiffFirstVsLast: diff,
  });
  console.log(`${id}: ${j.streams[0].width}x${j.streams[0].height} ${Number(j.format.duration).toFixed(2)}s loopDiff=${diff}`);
}
writeFileSync("/work/loop-check.json", JSON.stringify(report, null, 2));
console.log("loop check written to /work/loop-check.json");
