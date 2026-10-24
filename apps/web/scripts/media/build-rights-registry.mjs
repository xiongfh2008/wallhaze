/**
 * Builds the machine-readable media rights registry and the docs inventory.
 * It never changes source files; it only records facts (hash, MIME, sources)
 * and the current publication decision.
 *
 * Usage: node scripts/media/build-rights-registry.mjs
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, isAbsolute, join, relative } from "node:path";

const ROOT = process.cwd();
const MANIFEST_PATH = join(ROOT, "scripts", "media", "photo-manifest.json");
const AUDIT_PATH = join(ROOT, "scripts", "media", "license-audit.json");
const REGISTRY_DIR = join(ROOT, "data");
const REGISTRY_PATH = join(REGISTRY_DIR, "media-rights.json");
const DOCS_PATH = join(ROOT, "..", "..", "docs", "codex", "MEDIA-ASSET-INVENTORY.md");

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const audit = JSON.parse(readFileSync(AUDIT_PATH, "utf8"));
const byOutput = new Map(manifest.map((item) => [item.output, item]));
const auditByOutput = new Map(audit.map((item) => [item.output, item]));

const PUBLIC_STYLE_IMAGES = new Set([
  "starry-galaxy",
  "mountain-lake",
  "deep-ocean",
  "aurora-nights",
  "architecture-minimal",
  "macro-nature",
  "soft-gradient",
  "abstract-light",
]);
const SELF_STYLE_IMAGES = new Set(["soft-gradient", "abstract-light"]);
const SELF_WALLPAPERS = new Set(["light-ribbons-wide"]);
// Historical remote style URLs. The image fields were removed from
// lib/styles.ts so no unverified URL ships in the client bundle; the prompts
// are retained here only so the audit inventory can identify the old source.
const REMOTE_STYLES = [
  {
    id: "anime",
    prompt:
      "anime wallpaper art, girl in school uniform standing under glowing cherry blossoms at night, purple lantern light, dreamy violet sky, studio anime illustration, highly detailed",
    size: "portrait_16_9",
  },
  {
    id: "cyberpunk",
    prompt:
      "cyberpunk city wallpaper at night, neon purple and cyan signs, rain soaked street reflections, towering futuristic skyscrapers, cinematic digital art, moody atmosphere",
    size: "portrait_16_9",
  },
  {
    id: "fantasy",
    prompt:
      "epic fantasy wallpaper, floating islands with glowing waterfalls above a violet mist valley, magical light rays, detailed digital painting",
    size: "portrait_16_9",
  },
  {
    id: "nature",
    prompt:
      "serene nature wallpaper, misty mountain peaks at twilight under a deep purple and blue gradient sky, minimal moody landscape photography",
    size: "portrait_16_9",
  },
  {
    id: "minimalist",
    prompt:
      "minimalist abstract wallpaper, soft glowing violet gradient orb centered on a deep dark background, clean smooth design, subtle film grain",
    size: "portrait_16_9",
  },
  {
    id: "surreal",
    prompt:
      "surreal dreamscape wallpaper, giant glowing moon over a mirror like desert with a lone standing door, purple and pink palette, imaginative fine art",
    size: "portrait_16_9",
  },
];
const DEMO_IDS = [
  "night-sakura",
  "neon-rain",
  "star-drift",
  "jellyfish-glow",
  "aurora-veil",
  "sunset-station",
  "forest-light",
  "flower-field",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const posix = (path) => path.replaceAll("\\", "/");
const rel = (path) => posix(relative(ROOT, path));
const mimeOf = (path) => {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  return "application/octet-stream";
};

function fileRecord({ assetId, path, usage, sourceType, reviewStatus, canPubliclyDisplay, canOfferDownload, publiclyAccessible, notes, parentAssetIds = [], source = null }) {
  const absolute = isAbsolute(path) ? path : join(ROOT, path);
  if (!existsSync(absolute)) throw new Error(`missing asset: ${path}`);
  const bytes = readFileSync(absolute);
  const auditRecord = source ? auditByOutput.get(source.output) : null;
  return {
    assetId,
    path: publiclyAccessible ? `/${posix(relative(join(ROOT, "public"), absolute))}` : rel(absolute),
    privatePath: publiclyAccessible ? null : rel(absolute),
    mime: mimeOf(path),
    bytes: statSync(absolute).size,
    sha256: sha256(bytes),
    usage,
    sourceType,
    sourceUrl: source?.sourcePage ?? null,
    sourceFileUrl: source?.sourceUrl ?? null,
    sourceTitle: source?.sourceTitle ?? null,
    author: source?.author ?? (sourceType === "self-authored" ? "WallHaze (self-authored)" : null),
    licenseType: source?.license ?? (sourceType === "self-authored" ? "self-authored" : "unknown"),
    licenseUrl: source?.licenseUrl ?? null,
    licenseEvidence:
      source?.licenseEvidence ??
      (sourceType === "self-authored"
        ? "Generated locally by repository scripts; no third-party source used."
        : null),
    auditCheckedAt: auditRecord?.checkedAt ?? null,
    auditVerified: auditRecord?.licenseVerified ?? null,
    attributionRequired: auditRecord?.attributionRequired === "true" ? true : source?.license === "CC0" ? false : null,
    attributionText:
      source?.license === "CC0"
        ? `${source.author} · CC0 1.0`
        : sourceType === "self-authored"
          ? "WallHaze · self-authored"
          : null,
    modificationNotes: source?.modifications ?? "None recorded.",
    thirdPartyRights:
      source?.thirdPartyRights ??
      (reviewStatus === "pending"
        ? "Unknown: legacy file has no per-file provenance; may contain characters, trademarks or identifiable people."
        : reviewStatus === "restricted"
          ? "Unknown: external generator output; no provider/model terms or release evidence."
          : "No known third-party rights; see source record."),
    aiGenerated:
      sourceType === "wikimedia-cc0"
        ? false
        : sourceType === "self-authored"
          ? false
          : "unknown",
    reviewStatus,
    canPubliclyDisplay,
    canOfferDownload,
    publiclyAccessible,
    externalAccessible: false,
    parentAssetIds,
    reviewedAt: "2026-10-24",
    reviewedBy: "automated-rights-audit",
    notes,
  };
}

const assets = [];

// 31 legacy local style previews: moved to private-media.
const privateStyleDir = join(ROOT, "private-media", "review-pending", "styles");
for (const name of readdirSync(privateStyleDir).filter((f) => f.endsWith(".jpg")).sort()) {
  const id = name.replace(/\.jpg$/, "");
  assets.push(
    fileRecord({
      assetId: `style.${id}`,
      path: join(privateStyleDir, name),
      usage: "style-preview",
      sourceType: "legacy-local-unknown",
      reviewStatus: "pending",
      canPubliclyDisplay: false,
      canOfferDownload: false,
      publiclyAccessible: false,
      notes:
        "Legacy local style image with no per-file licence evidence. Moved out of public/; restore only after a human review records evidence.",
    })
  );
}

// 8 cleared public style previews.
for (const name of readdirSync(join(ROOT, "public", "images", "styles"))
  .filter((f) => f.endsWith(".jpg"))
  .sort()) {
  const id = name.replace(/\.jpg$/, "");
  if (!PUBLIC_STYLE_IMAGES.has(id)) continue;
  const source = byOutput.get(`/images/styles/${name}`) ?? null;
  const self = SELF_STYLE_IMAGES.has(id);
  assets.push(
    fileRecord({
      assetId: `style.${id}`,
      path: join(ROOT, "public", "images", "styles", name),
      usage: "style-preview",
      sourceType: self ? "self-authored" : "wikimedia-cc0",
      reviewStatus: "verified",
      canPubliclyDisplay: true,
      canOfferDownload: true,
      publiclyAccessible: true,
      source,
      notes: self
        ? "Procedural abstract style preview; self-authored, no third-party source."
        : "CC0 photograph with Commons evidence; public display and download permitted.",
    })
  );
}

// 11 wallpaper files.
for (const name of readdirSync(join(ROOT, "public", "images", "wallpapers"))
  .filter((f) => f.endsWith(".jpg"))
  .sort()) {
  const id = name.replace(/\.jpg$/, "");
  const source = byOutput.get(`/images/wallpapers/${name}`) ?? null;
  const self = SELF_WALLPAPERS.has(id);
  assets.push(
    fileRecord({
      assetId: `wallpaper.${id}`,
      path: join(ROOT, "public", "images", "wallpapers", name),
      usage: "gallery-wallpaper",
      sourceType: self ? "self-authored" : "wikimedia-cc0",
      reviewStatus: "verified",
      canPubliclyDisplay: true,
      canOfferDownload: true,
      publiclyAccessible: true,
      source,
      notes: self
        ? "Procedural wallpaper; self-authored, no third-party source."
        : "CC0 photograph crop; public display and download permitted.",
    })
  );
}

// 8 demos x (MP4, poster, source frame).
for (const demo of DEMO_IDS) {
  const frameOutput = `/videos/live-demos/${demo}-frame.jpg`;
  const source = byOutput.get(frameOutput) ?? null;
  if (!source) throw new Error(`missing manifest source for ${demo}`);
  assets.push(
    fileRecord({
      assetId: `frame.${demo}`,
      path: join(ROOT, "public", "videos", "live-demos", `${demo}-frame.jpg`),
      usage: "live-demo-source-frame",
      sourceType: "wikimedia-cc0",
      reviewStatus: "verified",
      canPubliclyDisplay: true,
      canOfferDownload: true,
      publiclyAccessible: true,
      source,
      notes: "CC0 source frame used to build the local motion demo.",
    }),
    fileRecord({
      assetId: `poster.${demo}`,
      path: join(ROOT, "public", "videos", "live-demos", `${demo}.jpg`),
      usage: "live-demo-poster",
      sourceType: "wikimedia-cc0",
      reviewStatus: "verified",
      canPubliclyDisplay: true,
      canOfferDownload: true,
      publiclyAccessible: true,
      source,
      parentAssetIds: [`frame.${demo}`],
      notes: "Poster derived from the source frame; no third-party addition.",
    }),
    fileRecord({
      assetId: `video.${demo}`,
      path: join(ROOT, "public", "videos", "live-demos", `${demo}.mp4`),
      usage: "live-demo-video",
      sourceType: "wikimedia-cc0",
      reviewStatus: "verified",
      canPubliclyDisplay: true,
      canOfferDownload: true,
      publiclyAccessible: true,
      source,
      parentAssetIds: [`frame.${demo}`],
      notes:
        "Silent 5s H.264 loop with local camera drift and particles; source photograph is CC0, local derivative is not AI-generated.",
    })
  );
}

// 6 historical remote style previews. Their URLs were removed from the
// exported catalogue and are not served by this site.
const remoteUrl = (prompt, size) =>
  `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
    prompt
  )}&image_size=${size}`;
for (const remote of REMOTE_STYLES) {
  const id = remote.id;
  const url = remoteUrl(remote.prompt, remote.size);
  assets.push({
    assetId: `remote.style.${id}`,
    path: url,
    privatePath: null,
    mime: "image/jpeg",
    bytes: null,
    sha256: null,
    usage: "style-preview",
    sourceType: "external-ai-unknown",
    sourceUrl: null,
    sourceFileUrl: url,
    sourceTitle: null,
    author: null,
    licenseType: "unknown",
    licenseUrl: null,
    licenseEvidence: null,
    auditCheckedAt: null,
    auditVerified: false,
    attributionRequired: null,
    attributionText: null,
    modificationNotes: "Remote text-to-image endpoint; no local derivative recorded.",
    thirdPartyRights:
      "Unknown: no provider/model terms, model version or output-rights evidence; may depict characters or styles requiring additional rights.",
    aiGenerated: true,
    provider: "trae-api-cn.mchost.guru",
    reviewStatus: "restricted",
    canPubliclyDisplay: false,
    canOfferDownload: false,
    publiclyAccessible: false,
    externalAccessible: true,
    parentAssetIds: [],
    reviewedAt: "2026-10-24",
    reviewedBy: "automated-rights-audit",
    notes:
      "Removed from the exported style catalogue. External URL is outside this site's control; do not re-enable without evidence.",
  });
}

// Two retired remote hero/demo URLs. They are no longer referenced; recorded
// so the audit covers the historical public surface.
for (const retired of [
  {
    assetId: "remote.hero.legacy",
    prompt:
      "breathtaking surreal wallpaper artwork, violet and blue nebula sky over a futuristic city with glowing purple lights, cinematic atmosphere, ultra detailed digital painting, dark moody tones",
    size: "landscape_16_9",
  },
  {
    assetId: "remote.studio-sample.legacy",
    prompt:
      "astronaut floating in a glowing purple nebula surrounded by stars, cinematic sci-fi phone wallpaper, deep violet and blue palette, ultra detailed digital art",
    size: "portrait_16_9",
  },
]) {
  assets.push({
    assetId: retired.assetId,
    path: remoteUrl(retired.prompt, retired.size),
    privatePath: null,
    mime: "image/jpeg",
    bytes: null,
    sha256: null,
    usage: retired.assetId.includes("hero") ? "hero" : "studio-sample",
    sourceType: "external-ai-unknown",
    sourceUrl: null,
    sourceFileUrl: remoteUrl(retired.prompt, retired.size),
    sourceTitle: null,
    author: null,
    licenseType: "unknown",
    licenseUrl: null,
    licenseEvidence: null,
    auditCheckedAt: null,
    auditVerified: false,
    attributionRequired: null,
    attributionText: null,
    modificationNotes: "Remote generator URL; retired from the UI.",
    thirdPartyRights: "Unknown external AI output; no provider/model/rights evidence.",
    aiGenerated: true,
    provider: "trae-api-cn.mchost.guru",
    reviewStatus: "restricted",
    canPubliclyDisplay: false,
    canOfferDownload: false,
    publiclyAccessible: false,
    externalAccessible: true,
    parentAssetIds: [],
    reviewedAt: "2026-10-24",
    reviewedBy: "automated-rights-audit",
    notes:
      "Retired from the public homepage/Studio preview; no longer referenced by code.",
  });
}

assets.sort((a, b) => a.assetId.localeCompare(b.assetId));

const registry = {
  version: 1,
  generatedAt: new Date().toISOString(),
  reviewedAt: "2026-10-24",
  reviewedBy: "automated-rights-audit",
  policy: {
    publication:
      "A file is served only when canPubliclyDisplay=true and it lives under public/. Pending/restricted files live outside public/ and are not served by Next.js.",
    download:
      "canOfferDownload mirrors the product gate; it is not a licence by itself. CC0/self-authored only in this dataset.",
    review:
      "No automated process may promote review-pending to verified. A human reviewer must record evidence and use scripts/media/restore-asset.mjs.",
  },
  counts: {
    total: assets.length,
    verified: assets.filter((a) => a.reviewStatus === "verified").length,
    pending: assets.filter((a) => a.reviewStatus === "pending").length,
    restricted: assets.filter((a) => a.reviewStatus === "restricted").length,
    rejected: assets.filter((a) => a.reviewStatus === "rejected").length,
    removed: assets.filter((a) => a.reviewStatus === "removed").length,
  },
  assets,
};

mkdirSync(REGISTRY_DIR, { recursive: true });
writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);

const rows = assets
  .map(
    (a) =>
      `| \`${a.assetId}\` | ${a.usage} | \`${a.path}\` | ${a.licenseType} | ${a.reviewStatus} | ${a.canPubliclyDisplay ? "yes" : "no"} | ${a.canOfferDownload ? "yes" : "no"} | ${a.publiclyAccessible ? "yes" : "no"} | ${a.sha256 ? a.sha256.slice(0, 12) : "—"} |`
  )
  .join("\n");

const markdown = `# WallHaze V2.0 媒体资产清单

- 生成时间：${registry.generatedAt}
- 机器可读源：\`apps/web/data/media-rights.json\`
- 复核基准日：2026-10-24
- 资产总数：**${registry.counts.total}**
- verified：**${registry.counts.verified}**；pending：**${registry.counts.pending}**；restricted：**${registry.counts.restricted}**；rejected：**${registry.counts.rejected}**；removed：**${registry.counts.removed}**

> 规则：只有 \`canPubliclyDisplay=true\` 且位于 \`public/\` 的文件会被 Next.js 直接提供。pending/restricted 文件已移出 \`public/\`，原始 URL 返回 404。没有文件被删除；映射与哈希在 \`private-media/review-pending/manifest.json\`。

| Asset ID | 用途 | 当前路径 | 授权 | reviewStatus | 公开展示 | 允许下载 | 公开可访问 | SHA-256 前 12 位 |
|---|---|---|---|---|---|---|---|---|
${rows}

## 来源分类

- \`wikimedia-cc0\`：Wikimedia Commons 的 CC0 照片；逐文件来源、作者、许可和核验日期见 \`photo-manifest.json\` / \`license-audit.json\`。
- \`self-authored\`：仓库脚本本地绘制的抽象图；无第三方源。
- \`legacy-local-unknown\`：旧本地风格图，无逐文件授权证据；已隔离。
- \`external-ai-unknown\`：旧外部 text-to-image URL，无法验证 provider/model/输出权利；已从导出目录移除。

## 未完成

- 31 张 legacy 本地图仍待人工逐张复核，未自动升级。
- 6 个外部 AI 风格 URL 和 2 个已退役 hero/demo URL 无法核实 provider 条款；只在清单保留记录，不再公开引用。
`;
mkdirSync(join(ROOT, "..", "..", "docs", "codex"), { recursive: true });
writeFileSync(DOCS_PATH, markdown);

console.log(
  JSON.stringify(
    {
      registry: rel(REGISTRY_PATH),
      inventory: posix(relative(ROOT, DOCS_PATH)),
      counts: registry.counts,
    },
    null,
    2
  )
);
