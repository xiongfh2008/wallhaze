// One-off live acceptance for the new live demos: page facts + playback
// probe + screenshots at desktop and mobile widths.
// Run: node scripts/verify-live3.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { withHeadlessPage } from "./media/cdp.mjs";

mkdirSync(".screenshots", { recursive: true });
const shots = [];
await withHeadlessPage(async ({ call, evaluate }) => {
  const NEW = ["haunted-manor", "sakura-night-anime", "seoul-neon-rain", "mecha-awakening", "interstellar-frontier", "dragon-realm"];
  for (const [width, height, name, mobile] of [
    [1440, 900, "demos-desktop", false],
    [390, 844, "demos-mobile", true],
  ]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile,
    });
    console.log(name, "navigate…");
    await call("Page.navigate", { url: "https://wallhaze.com/zh/wallpapers" });
    console.log(name, "navigated");
    await new Promise((r) => setTimeout(r, 6000));
    console.log(name, "evaluating…");
    const sectionOk = await evaluate(
      "Boolean(document.querySelector('#live-demo-heading'))"
    );
    await evaluate(
      "(() => { const el = document.querySelector('#live-demo-heading'); if (el) el.closest('section').scrollIntoView({ block: 'start' }); })()"
    );
    await new Promise((r) => setTimeout(r, 1500));
    const videoStates = await evaluate(
      "[...document.querySelectorAll('section video[data-live-demo]')].map(v => ({ id: v.dataset.liveDemo, playing: !v.paused && v.readyState > 2, duration: Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null }))"
    );
    const overflow = await evaluate(
      "document.scrollingElement.scrollWidth - window.innerWidth"
    );
    const IDS = ["haunted-manor", "sakura-night-anime", "seoul-neon-rain", "mecha-awakening", "interstellar-frontier", "dragon-realm"];
    const facts = {
      sectionOk,
      cards: videoStates.length,
      newIdsPresent: videoStates.filter((v) => IDS.includes(v.id)).length,
      oldVideosRendered: videoStates.filter((v) => ["night-sakura", "jellyfish-glow", "flower-field", "neon-rain"].includes(v.id)).length,
      playingAfterInView: videoStates.filter((v) => v.playing).map((v) => v.id),
      durationsDeclared: videoStates.map((v) => v.id + ":" + (v.duration ?? "?") + "s"),
      pageOverflowPx: overflow,
    };

    await new Promise((r) => setTimeout(r, 1200));
    console.log(name, "capturing…");
    const png = await call("Page.captureScreenshot", { format: "png" });
    writeFileSync(`.screenshots/${name}.png`, Buffer.from(png.data, "base64"));
    shots.push({ name, ...facts });
    console.log(name, JSON.stringify(facts));
    // Playback probe: start one video via user-gesture evaluate, verify it
    // actually plays and exposes its duration, then pause it again.
    const playback = await evaluate(
      "(async () => { const v = document.querySelector('section video[data-live-demo]'); if (!v) return { ok: false }; try { await v.play(); } catch (e) { return { ok: false, reason: 'play rejected' }; } await new Promise((r) => setTimeout(r, 1200)); const state = { ok: !v.paused, id: v.dataset.liveDemo, duration: Number.isFinite(v.duration) ? Math.round(v.duration * 100) / 100 : null, w: v.videoWidth, h: v.videoHeight, time: Math.round(v.currentTime * 100) / 100 }; v.pause(); return state; })()"
    );
    shots.push({ name: name + "-playback", ...playback });
    console.log(name, "playback:", JSON.stringify(playback));
  }
});
