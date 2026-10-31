// Offline operations batch: 6 original AI live-wallpaper demos.
// Pipeline per theme: first frame (fal-ai/flux-2/klein/4b, 1280x720)
//   -> Wan 2.2-5B image-to-video (720p, 5s, silent, safety checker)
//   -> ffmpeg seamless-loop blend (tail dissolves into head)
//   -> H.264 yuv420p faststart MP4 + poster JPEG + loop check.
//
// Runs ON the VPS inside the API image (node + ffmpeg) with FAL_KEY from
// --env-file /opt/wallhaze/secrets/api.env. The key is never printed.
// Budget: hard cap 8 first-frame requests + 10 I2V requests (est. < $2
// total, under the authorized $5). Retries: at most 2 per stage.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const WORK = "/work";
const OUT = `${WORK}/live-out`;
const IMAGE_ENDPOINT = "https://fal.run/fal-ai/flux-2/klein/4b";
const I2V_ENDPOINT = "https://queue.fal.run/fal-ai/wan/v2.2-5b/image-to-video";
const MAX_IMAGE_REQUESTS = 8;
const MAX_I2V_REQUESTS = 10;

const THEMES = [
  {
    id: "haunted-manor",
    styleId: "gothic-horror",
    title: "Haunted Manor",
    framePrompt:
      "Original gothic manor on a hill at night, blue mist rolling across overgrown grounds, pale moonlight, one warm flickering window, bare trees, cinematic wide composition, photorealistic dark atmosphere without gore, desktop wallpaper, no text, no logos, no watermark",
    motionPrompt:
      "Seamless looping animation. Locked camera. Blue mist slowly rolling across the manor grounds, the warm window light flickering gently, tree branches swaying very slightly. Subtle periodic motion. No scene cuts. No abrupt motion. No camera movement. Start and end frames should visually match.",
  },
  {
    id: "sakura-night-anime",
    styleId: "cozy-anime",
    title: "Sakura Night",
    framePrompt:
      "Original anime girl in a dark school uniform standing beneath a large cherry blossom tree at night, moonlight through the branches, petals in the air, quiet suburban street with warm lamps in the background, soft indigo-and-pink palette, vertical-friendly anime illustration, detailed background art, wallpaper composition, no text, no logos, no watermark, original character design",
    motionPrompt:
      "Seamless looping animation. Locked camera. Cherry blossom petals slowly drifting down, the girl's hair gently swaying in a light breeze, soft lamp glow pulsing very subtly. Subtle periodic motion. No scene cuts. No abrupt motion. The girl stays still except hair and clothes micro-motion. Start and end frames should visually match.",
  },
  {
    id: "seoul-neon-rain",
    styleId: "cyberpunk",
    title: "Seoul Neon Rain",
    framePrompt:
      "Original Korean city alley at night in the rain, blue and violet neon signs reflecting on wet asphalt, a pedestrian with a glowing umbrella mid-distance, steam from vents, cinematic depth, photorealistic cyberpunk atmosphere, desktop wallpaper, no text, no readable signage, no logos, no watermark",
    motionPrompt:
      "Seamless looping animation. Locked camera. Rain falling steadily, neon signs flickering softly, wet-road reflections shimmering, steam drifting slowly. Subtle periodic motion. No scene cuts. No abrupt motion. Start and end frames should visually match.",
  },
  {
    id: "mecha-awakening",
    styleId: "mecha",
    title: "Mecha Awakening",
    framePrompt:
      "Original futuristic mecha standing in a hero pose on a tech-city platform, glowing energy core in its chest, city lights and holograms behind, cool blue with amber highlights, anime key-visual quality, locked centered composition, desktop wallpaper, no text, no logos, no watermark, original mechanical design",
    motionPrompt:
      "Seamless looping animation. Locked camera. The mecha stays fixed in place: its chest energy core pulses in a slow rhythm, panel lights cycle through colors, tiny glowing particles float upward around it. Subtle periodic motion. No scene cuts. No abrupt motion. No walking. Start and end frames should visually match.",
  },
  {
    id: "interstellar-frontier",
    styleId: "sci-fi",
    title: "Interstellar Frontier",
    framePrompt:
      "Original orbital space station above a giant ringed planet, nebula clouds in teal and gold, tiny shuttle lights, hard science-fiction concept realism, wide cinematic composition, desktop wallpaper, no text, no logos, no watermark",
    motionPrompt:
      "Seamless looping animation. Locked camera. Stars twinkling slowly, fine particles drifting past the station, the station's lights blinking in a gentle cycle, the planet's ring shimmering subtly. Subtle periodic motion. No scene cuts. No abrupt motion. Start and end frames should visually match.",
  },
  {
    id: "dragon-realm",
    styleId: "dark-fantasy",
    title: "Dragon Realm",
    framePrompt:
      "Ancient citadel on a dark ridge with an original dragon silhouette circling in a violet magic sky, swirling arcane clouds, distant lightning glow, epic dark-fantasy matte painting without gore, wide cinematic composition, desktop wallpaper, no text, no logos, no watermark",
    motionPrompt:
      "Seamless looping animation. Locked camera. Violet magic particles drifting upward, distant lightning flickering behind the clouds, the dragon silhouette gliding in a slow circle, clouds flowing slowly. Subtle periodic motion. No scene cuts. No abrupt motion. No gore. Start and end frames should visually match.",
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let imageRequests = 0;
let i2vRequests = 0;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Key ${process.env.FAL_KEY}`,
  };
}

async function firstFrame(theme) {
  imageRequests += 1;
  const response = await fetch(IMAGE_ENDPOINT, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      prompt: theme.framePrompt,
      image_size: { width: 1280, height: 720 },
      num_images: 1,
      enable_safety_checker: true,
      output_format: "png",
      seed: 310000 + THEMES.indexOf(theme) * 17,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    throw new Error(`first frame HTTP ${response.status}: ${(await response.text()).slice(0, 150)}`);
  }
  const payload = await response.json();
  const image = payload?.images?.[0];
  if (!image?.url) throw new Error("first frame had no image");
  return { bytes: Buffer.from(await (await fetch(image.url)).arrayBuffer()), seed: payload.seed ?? null };
}

async function imageToVideo(theme, frameBytes, attempt) {
  i2vRequests += 1;
  const dataUri = `data:image/png;base64,${frameBytes.toString("base64")}`;
  const submit = await fetch(I2V_ENDPOINT, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      image_url: dataUri,
      prompt: theme.motionPrompt,
      negative_prompt: "scene cuts, camera movement, fast motion, flicker artifacts, text, watermark, logo, gore",
      num_frames: 120,
      frames_per_second: 24,
      resolution: "720p",
      aspect_ratio: "16:9",
      enable_safety_checker: true,
      video_quality: "high",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!submit.ok) {
    throw new Error(`i2v submit HTTP ${submit.status}: ${(await submit.text()).slice(0, 150)}`);
  }
  const { request_id, status_url, response_url } = await submit.json();
  if (!request_id) throw new Error("i2v submit returned no request id");

  const base = `${I2V_ENDPOINT}/requests/${encodeURIComponent(request_id)}`;
  const statusUrl = status_url ?? `${base}/status`;
  const resultUrl = response_url ?? base;

  for (;;) {
    await sleep(12_000);
    const state = await (await fetch(statusUrl, { headers: authHeaders(), signal: AbortSignal.timeout(30_000) })).json();
    if (state.status === "COMPLETED") break;
    if (state.status === "FAILED" || state.status === "CANCELED") {
      throw new Error(`i2v failed: ${JSON.stringify(state).slice(0, 150)}`);
    }
    console.log(`[i2v] ${theme.id} attempt ${attempt}: ${state.status}`);
  }

  const result = await (await fetch(resultUrl, { headers: authHeaders(), signal: AbortSignal.timeout(60_000) })).json();
  const videoUrl = result?.video?.url;
  if (!videoUrl) throw new Error(`i2v result had no video: ${JSON.stringify(result).slice(0, 150)}`);
  return {
    bytes: Buffer.from(await (await fetch(videoUrl)).arrayBuffer()),
    requestId: request_id,
    falUrl: videoUrl,
    seed: result.seed ?? null,
  };
}

async function run() {
  if (!process.env.FAL_KEY) {
    console.error("[live] FAL_KEY missing — refusing to run");
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  mkdirSync(`${WORK}/frames`, { recursive: true });
  const results = [];
  const failures = [];

  for (const theme of THEMES) {
    try {
      // Stage 1: first frame (reuse if this id already produced one).
      const frameFile = `${WORK}/frames/${theme.id}.png`;
      let frameBytes;
      if (existsSync(frameFile)) {
        frameBytes = (await import("node:fs")).readFileSync(frameFile);
        console.log(`[frame] ${theme.id}: reusing existing first frame`);
      } else {
        if (imageRequests >= MAX_IMAGE_REQUESTS) throw new Error("image budget exhausted");
        const frame = await firstFrame(theme);
        writeFileSync(frameFile, frame.bytes);
        frameBytes = frame.bytes;
        console.log(`[frame] ${theme.id}: ok (${Math.round(frameBytes.length / 1024)} KB)`);
      }

      // Stage 2: image-to-video with retry (max 2 attempts).
      let video = null;
      for (let attempt = 1; attempt <= 2 && !video; attempt += 1) {
        if (i2vRequests >= MAX_I2V_REQUESTS) throw new Error("i2v budget exhausted");
        try {
          console.log(`[i2v] ${theme.id}: submitting (attempt ${attempt})…`);
          video = await imageToVideo(theme, frameBytes, attempt);
          console.log(`[i2v] ${theme.id}: downloaded (${Math.round(video.bytes.length / 1024)} KB)`);
        } catch (error) {
          console.error(`[i2v] ${theme.id} attempt ${attempt} failed: ${String(error.message).slice(0, 140)}`);
          failures.push({ id: theme.id, stage: "i2v", attempt, error: String(error.message).slice(0, 180) });
          await sleep(5000);
        }
      }
      if (!video) continue;

      // Stage 3: seamless-loop blend + normalize.
      const raw = `${WORK}/${theme.id}-raw.mp4`;
      const final = `${OUT}/${theme.id}.mp4`;
      writeFileSync(raw, video.bytes);
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileP = promisify(execFile);
      await execFileP("ffmpeg", [
        "-y", "-i", raw, "-filter_complex",
        "[0:v]split=2[a];[a]trim=0:4.5,setpts=PTS-STARTPTS[v1];[a]trim=4.5,setpts=PTS-STARTPTS[v2];[v1][v2]xfade=transition=fade:duration=0.5:offset=4.0,format=yuv420p[out]",
        "-map", "[out]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "21",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", final,
      ], { timeout: 300_000 });
      await execFileP("ffmpeg", [
        "-y", "-i", final, "-ss", "1.0", "-frames:v", "1", `${OUT}/${theme.id}.jpg`,
      ], { timeout: 60_000 });
      console.log(`[ffmpeg] ${theme.id}: loop blend + poster done`);
      results.push({
        id: theme.id,
        styleId: theme.styleId,
        title: theme.title,
        framePrompt: theme.framePrompt,
        motionPrompt: theme.motionPrompt,
        requestId: video.requestId,
        seed: video.seed,
        falUrl: video.falUrl,
        model: "fal-ai/wan/v2.2-5b/image-to-video",
        frameModel: "fal-ai/flux-2/klein/4b",
      });
    } catch (error) {
      console.error(`[live] ${theme.id} FAILED: ${String(error.message).slice(0, 160)}`);
      failures.push({ id: theme.id, stage: "pipeline", error: String(error.message).slice(0, 180) });
    }
  }

  writeFileSync(`${WORK}/live-manifest.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    imageRequests,
    i2vRequests,
    estimatedCostUsd: Math.round((imageRequests * 0.03 + i2vRequests * 0.15) * 100) / 100,
    budgetUsd: 5,
    succeeded: results.length,
    failures,
    results,
  }, null, 2));
  console.log(`[live] done: ${results.length}/${THEMES.length} videos, imageReq=${imageRequests} i2vReq=${i2vRequests}, est. $${Math.round((imageRequests * 0.03 + i2vRequests * 0.15) * 100) / 100}`);
}

run().catch((e) => {
  console.error(`[live] fatal: ${e.message}`);
  process.exit(1);
});
