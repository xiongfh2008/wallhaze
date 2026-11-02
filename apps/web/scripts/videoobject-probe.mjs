// VideoObject end-to-end probe:
// 1. Back up works.json (byte-exact), inject one published demo video work,
// 2. fetch /community/<slug> and /sitemap.xml, verify JSON-LD,
// 3. restore works.json byte-exact.
// Uses ONLY real local assets that exist under public/ — no fabricated media.
import { readFileSync, writeFileSync } from "node:fs";
const WORKS = "data/community/works.json";
const SLUG = "demo-909";
const backup = readFileSync(WORKS);

const entry = {
  id: "review-probe-video-001",
  slug: SLUG,
  origin: "demo_seed",
  status: "published",
  title: "Review Probe Live Wallpaper",
  description:
    "Temporary review probe: an aurora live wallpaper captured in the existing cleared demo asset. Used only to verify VideoObject structured data generation.",
  titleKey: null,
  descriptionKey: null,
  authorId: "demo-sample",
  themeId: null,
  mediaType: "video",
  styleId: "cozy-anime",
  deviceType: "phone",
  width: 1080,
  height: 1920,
  durationSeconds: 5,
  sourceType: "demo-local-self",
  sourceDescription: "Existing cleared demo asset reused for a local schema probe; no new media produced.",
  sourceDescriptionKey: null,
  licenseType: "self-authored",
  licenseUrl: null,
  allowPublicDisplay: true,
  allowDownload: true,
  downloadLicense: "self-authored",
  downloadScope: "self-authored",
  downloadScopeNote: "Review probe — self-authored demo asset.",
  reviewedAt: "2026-11-02",
  publishedAt: "2026-11-02T00:00:00.000Z",
  featured: false,
  previewAsset: "/videos/live-demos/aurora-veil.mp4",
  posterAsset: "/images/wallpapers/aurora-veil.jpg",
  downloadAsset: "/videos/live-demos/aurora-veil.mp4",
};

try {
  const data = JSON.parse(backup.toString("utf8"));
  data.works.push(entry);
  writeFileSync(WORKS, JSON.stringify(data, null, 2) + "\n");
  // wait for dev recompile
  let ok = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch(`http://127.0.0.1:3100/community/${SLUG}`);
    if (res.status === 200) { ok = true; break; }
    console.log("waiting for page...", res.status);
  }
  if (!ok) throw new Error("community page never returned 200");
  const html = await (await fetch(`http://127.0.0.1:3100/community/${SLUG}`)).text();
  const blocks = [...html.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const nodes = blocks.flat();
  const cw = nodes.find((n) => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]).includes("VideoObject"));
  console.log("== VideoObject node ==");
  console.log(cw ? JSON.stringify({ "@type": cw["@type"], name: cw.name, duration: cw.duration, uploadDate: cw.uploadDate, thumbnailUrl: cw.thumbnailUrl, contentUrl: cw.contentUrl, encodingFormat: cw.encodingFormat, license: cw.license }, null, 1) : "MISSING VideoObject");
  const sm = await (await fetch("http://127.0.0.1:3100/sitemap.xml")).text();
  console.log("sitemap contains community slug:", sm.includes(`/community/${SLUG}`));
  // poster asset must exist
  const poster = await fetch("http://127.0.0.1:3100" + entry.posterAsset);
  const video = await fetch("http://127.0.0.1:3100" + entry.previewAsset, { method: "HEAD" });
  console.log("poster status:", poster.status, "| video status:", video.status, video.headers.get("content-type"));
} finally {
  writeFileSync(WORKS, backup);
  console.log("works.json restored byte-exact:", Buffer.compare(backup, readFileSync(WORKS)) === 0);
}
