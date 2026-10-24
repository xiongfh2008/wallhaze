#!/usr/bin/env node
/**
 * Manual Community ingest tool. This is intentionally a local, reviewer-run
 * CLI: there is no public upload route and no automatic publishing.
 *
 * Usage:
 *   node scripts/community/import-submission.mjs \
 *     --inbox ./community-inbox/my-work --reviewer alice --publish
 *   node scripts/community/import-submission.mjs \
 *     --inbox ./community-inbox/my-work --dry-run
 *
 * The inbox must contain `submission.json` plus the referenced media files.
 * contactEmail and licence evidence are written ONLY to private-media/.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { isMp4, probeMp4 } from "./mp4.mjs";

const ROOT = process.cwd();
const WORKS = path.join(ROOT, "data", "community", "works.json");
const AUTHORS = path.join(ROOT, "data", "community", "authors.json");
const THEMES = path.join(ROOT, "data", "community", "themes.json");
const PUBLIC = path.join(ROOT, "public", "community");
const PRIVATE = path.join(ROOT, "private-media", "community");
const REVIEWS = path.join(PRIVATE, "reviews");
const ORIGINALS = path.join(PRIVATE, "originals");
const AUDIT = path.join(PRIVATE, "audit-log.jsonl");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : null;
};

const publish = flag("publish");
const dryRun = flag("dry-run");
const inbox = option("inbox") ? path.resolve(ROOT, option("inbox")) : null;
const reviewer = option("reviewer");

function fail(message) {
  throw new Error(message);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}
function inboxFile(relative) {
  assert(typeof relative === "string" && relative.length > 0, "media file is required");
  const resolved = path.resolve(inbox, relative);
  assert(
    resolved === inbox || resolved.startsWith(`${inbox}${path.sep}`),
    `unsafe inbox path: ${relative}`
  );
  assert(existsSync(resolved), `missing file: ${relative}`);
  return resolved;
}
function sniffImage(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
function nativeDeviceFor(width, height) {
  const value = width / height;
  if (value <= 0.65) return "phone";
  if (value <= 1.12) return "tablet";
  return "desktop";
}
function styleIds() {
  const source = readFileSync(path.join(ROOT, "lib", "styles.ts"), "utf8");
  const start = source.indexOf("const RAW_WALLPAPER_STYLES");
  const end = source.indexOf("];", start);
  assert(start >= 0 && end > start, "could not read style registry");
  return new Set(
    [...source.slice(start, end).matchAll(/id: "([a-z0-9-]+)"/g)].map(
      (match) => match[1]
    )
  );
}

const MEDIA_TYPES = new Set(["image", "video"]);
const SOURCE_TYPES = new Set([
  "original",
  "ai-assisted",
  "ai-generated",
  "platform-cc0",
  "platform-self-authored",
]);
const LICENSE_TYPES = new Set([
  "CC0-1.0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "self-authored",
  "personal-use",
  "all-rights-reserved",
  "custom",
]);
const DOWNLOAD_SCOPES = new Set(["cc0", "self-authored", "personal-use", "custom"]);
const DEVICES = new Set(["phone", "tablet", "desktop"]);

async function main() {
  assert(inbox, "--inbox is required");
  assert(existsSync(inbox), `inbox does not exist: ${inbox}`);
  assert(dryRun || publish, "use --dry-run to validate or --publish to publish");
  assert(!(dryRun && publish), "choose --dry-run or --publish, not both");
  if (publish) assert(reviewer, "--reviewer is required to publish");

  const submissionPath = path.join(inbox, "submission.json");
  assert(existsSync(submissionPath), "submission.json is missing");
  const input = readJson(submissionPath);

  const styles = styleIds();
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug ?? ""), "invalid slug");
  assert(typeof input.title === "string" && input.title.trim(), "title is required");
  assert(
    typeof input.description === "string" && input.description.trim(),
    "description is required"
  );
  assert(input.author && typeof input.author === "object", "author is required");
  assert(
    /^[a-zA-Z0-9_-]{2,64}$/.test(input.author.authorId ?? ""),
    "author.authorId is invalid"
  );
  assert(
    typeof input.author.name === "string" && input.author.name.trim(),
    "author.name is required"
  );
  assert(
    !input.author.email && !input.author.contactEmail,
    "author contact email must be top-level contactEmail only"
  );
  assert(MEDIA_TYPES.has(input.mediaType), "mediaType must be image or video");
  assert(styles.has(input.styleId), `unknown styleId: ${input.styleId}`);
  assert(DEVICES.has(input.deviceType), "invalid deviceType");
  assert(SOURCE_TYPES.has(input.sourceType), "invalid sourceType");
  assert(
    !input.sourceType.startsWith("platform-"),
    "submission sourceType cannot claim platform ownership"
  );
  assert(
    typeof input.sourceDescription === "string" && input.sourceDescription.trim(),
    "sourceDescription is required"
  );
  assert(LICENSE_TYPES.has(input.licenseType), "invalid licenseType");
  assert(typeof input.allowPublicDisplay === "boolean", "allowPublicDisplay is required");
  assert(typeof input.allowDownload === "boolean", "allowDownload is required");
  assert(
    typeof input.contactEmail === "string" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail),
    "valid contactEmail is required"
  );
  assert(
    typeof input.licenseEvidenceReference === "string" &&
      input.licenseEvidenceReference.trim(),
    "licenseEvidenceReference is required"
  );
  if (publish) assert(input.allowPublicDisplay === true, "cannot publish a non-displayable work");
  assert(
    !input.author.socialUrl || /^https:\/\//.test(input.author.socialUrl),
    "author.socialUrl must be HTTPS"
  );
  if (input.allowDownload) {
    assert(
      input.licenseType !== "all-rights-reserved" &&
        input.licenseType !== "custom",
      "downloadable submissions need a concrete licenseType"
    );
    assert(
      LICENSE_TYPES.has(input.downloadLicense) &&
        input.downloadLicense !== "all-rights-reserved",
      "downloadLicense must grant a concrete download permission"
    );
    assert(DOWNLOAD_SCOPES.has(input.downloadScope), "downloadScope is required");
    if (input.downloadLicense === "custom") {
      assert(
        typeof input.downloadScopeNote === "string" &&
          input.downloadScopeNote.trim(),
        "custom download permission needs downloadScopeNote"
      );
    }
  }

  const works = readJson(WORKS);
  const authors = readJson(AUTHORS);
  const themes = readJson(THEMES);
  if (input.themeId) {
    assert(
      themes.themes.some((theme) => theme.id === input.themeId),
      `unknown themeId: ${input.themeId}`
    );
  }
  const slug = input.slug;
  assert(
    !works.works.some((work) => work.slug === slug),
    `slug already exists: ${slug}`
  );
  assert(
    !existsSync(path.join(REVIEWS, `${slug}.json`)),
    `review record already exists: ${slug}`
  );

  const mediaPath = inboxFile(input.mediaFile);
  const mediaBytes = readFileSync(mediaPath);
  const mediaExt = path.extname(mediaPath).toLowerCase();
  const publishedAt = input.publishedAt
    ? new Date(input.publishedAt).toISOString()
    : new Date().toISOString();
  let width;
  let height;
  let durationSeconds = null;
  let previewSource;
  let posterSource = null;

  if (input.mediaType === "image") {
    assert(sniffImage(mediaBytes), "mediaFile is not a real JPEG/PNG/WebP image");
    assert([".jpg", ".jpeg", ".png", ".webp"].includes(mediaExt), "unsupported image extension");
    const meta = await sharp(mediaPath).metadata();
    width = meta.width;
    height = meta.height;
    if ([5, 6, 7, 8].includes(meta.orientation)) [width, height] = [height, width];
    assert(width > 0 && height > 0, "could not read image dimensions");
    previewSource = mediaPath;
  } else {
    assert(isMp4(mediaBytes), "mediaFile is not a real MP4");
    const probe = probeMp4(mediaBytes);
    assert(probe.width && probe.height, "could not read video dimensions");
    assert(probe.durationSeconds, "could not read video duration (standard MP4 required)");
    width = probe.width;
    height = probe.height;
    durationSeconds = Number(probe.durationSeconds.toFixed(3));
    assert(input.posterFile, "posterFile is required for video");
    posterSource = inboxFile(input.posterFile);
    const posterBytes = readFileSync(posterSource);
    assert(sniffImage(posterBytes), "posterFile is not a real image");
    if (input.allowDownload) {
      previewSource = mediaPath;
    } else {
      assert(input.previewFile, "view-only video needs a separate previewFile");
      previewSource = inboxFile(input.previewFile);
      const previewBytes = readFileSync(previewSource);
      assert(isMp4(previewBytes), "previewFile must be MP4");
        assert(
          previewBytes.length < mediaBytes.length,
          "previewFile must be smaller than the original video"
        );
    }
  }

  const expectedDevice = nativeDeviceFor(width, height);
  assert(
    input.deviceType === expectedDevice,
    `deviceType is ${input.deviceType}, but actual dimensions are ${width}x${height} (${expectedDevice})`
  );

  const extension = input.mediaType === "image" ? mediaExt : ".mp4";
  const previewAsset =
    input.mediaType === "image"
      ? `/community/previews/${slug}.jpg`
      : `/community/previews/${slug}.mp4`;
  const posterAsset =
    input.mediaType === "video" ? `/community/posters/${slug}.jpg` : null;
  const downloadAsset = input.allowDownload
    ? input.mediaType === "image"
      ? `/community/downloads/${slug}${extension}`
      : previewAsset
    : null;
  const privateOriginal =
    input.allowDownload
      ? null
      : path.join(ORIGINALS, `${slug}${extension}`);

  const existingAuthor = authors.authors.find(
    (author) => author.authorId === input.author.authorId
  );
  if (existingAuthor) {
    assert(
      existingAuthor.name === input.author.name,
      "authorId already exists with a different public name"
    );
  }
  const authorAvatar = input.author.avatarFile
    ? `/community/avatars/${input.author.authorId}.jpg`
    : existingAuthor?.avatarAsset ?? null;

  const work = {
    id: `community-${slug}`,
    slug,
    origin: "submission",
    status: "published",
    title: input.title,
    description: input.description,
    titleKey: null,
    descriptionKey: null,
    authorId: input.author.authorId,
    themeId: input.themeId ?? null,
    mediaType: input.mediaType,
    styleId: input.styleId,
    deviceType: expectedDevice,
    width,
    height,
    durationSeconds,
    sourceType: input.sourceType,
    sourceDescription: input.sourceDescription,
    sourceDescriptionKey: null,
    licenseType: input.licenseType,
    licenseUrl: input.licenseUrl ?? null,
    allowPublicDisplay: true,
    allowDownload: input.allowDownload,
    downloadLicense: input.allowDownload
      ? input.downloadLicense
      : "all-rights-reserved",
    downloadScope: input.allowDownload ? input.downloadScope : "custom",
    downloadScopeNote: input.allowDownload ? input.downloadScopeNote ?? null : null,
    reviewedAt: new Date().toISOString().slice(0, 10),
    publishedAt,
    featured: input.featured === true,
    previewAsset,
    posterAsset,
    downloadAsset,
  };

  const plan = {
    slug,
    title: work.title,
    origin: work.origin,
    mediaType: work.mediaType,
    dimensions: `${width}x${height}`,
    deviceType: work.deviceType,
    allowDownload: work.allowDownload,
    previewAsset,
    posterAsset,
    downloadAsset,
    privateOriginal: privateOriginal
      ? path.relative(ROOT, privateOriginal).replaceAll("\\", "/")
      : null,
    reviewer: reviewer ?? null,
  };

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, plan }, null, 2));
    return;
  }

  // Validate collisions before writing anything.
  for (const asset of [previewAsset, posterAsset, downloadAsset].filter(Boolean)) {
    assert(
      !existsSync(path.join(ROOT, "public", asset.replace(/^\//, ""))),
      `public asset already exists: ${asset}`
    );
  }
  mkdirSync(path.join(PUBLIC, "previews"), { recursive: true });
  mkdirSync(path.join(PUBLIC, "posters"), { recursive: true });
  mkdirSync(path.join(PUBLIC, "downloads"), { recursive: true });
  mkdirSync(path.join(PUBLIC, "avatars"), { recursive: true });
  mkdirSync(REVIEWS, { recursive: true });
  mkdirSync(ORIGINALS, { recursive: true });

  if (input.mediaType === "image") {
    await sharp(mediaPath)
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(ROOT, "public", previewAsset.replace(/^\//, "")));
  } else {
    copyFileSync(previewSource, path.join(ROOT, "public", previewAsset.replace(/^\//, "")));
    await sharp(posterSource)
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(ROOT, "public", posterAsset.replace(/^\//, "")));
  }

  if (input.allowDownload) {
    if (input.mediaType === "image") {
      copyFileSync(mediaPath, path.join(ROOT, "public", downloadAsset.replace(/^\//, "")));
    }
  } else {
    copyFileSync(mediaPath, privateOriginal);
  }

  if (input.author.avatarFile) {
    const avatarPath = inboxFile(input.author.avatarFile);
    assert(sniffImage(readFileSync(avatarPath)), "avatarFile is not a real image");
    await sharp(avatarPath)
      .rotate()
      .resize({ width: 256, height: 256, fit: "cover" })
      .jpeg({ quality: 85 })
      .toFile(path.join(ROOT, "public", authorAvatar.replace(/^\//, "")));
  }

  if (existingAuthor) {
    if (authorAvatar) existingAuthor.avatarAsset = authorAvatar;
  } else {
    authors.authors.push({
      authorId: input.author.authorId,
      name: input.author.name,
      bio: input.author.bio ?? null,
      bioKey: null,
      avatarAsset: authorAvatar,
      socialUrl: input.author.socialUrl ?? null,
      isPlatform: false,
    });
  }

  works.works.push(work);
  writeJson(WORKS, works);
  writeJson(AUTHORS, authors);
  writeJson(path.join(REVIEWS, `${slug}.json`), {
    id: work.id,
    slug,
    contactEmail: input.contactEmail,
    licenseEvidenceReference: input.licenseEvidenceReference,
    reviewer,
    themeId: work.themeId,
    reviewedAt: work.reviewedAt,
    publishedAt: work.publishedAt,
    sourceMediaFile: path.basename(mediaPath),
    sourceMediaSha256: sha256(mediaBytes),
    originalPrivatePath: privateOriginal
      ? path.relative(ROOT, privateOriginal).replaceAll("\\", "/")
      : null,
    previewAsset,
    posterAsset,
    downloadAsset,
    status: "published",
  });
  mkdirSync(path.dirname(AUDIT), { recursive: true });
  writeFileSync(
    AUDIT,
    `${JSON.stringify({
      at: new Date().toISOString(),
      action: "publish",
      slug,
      reviewer,
      contactEmailStored: true,
      licenseEvidenceReference: input.licenseEvidenceReference,
    })}\n`,
    { flag: "a" }
  );

  console.log(JSON.stringify({ ok: true, published: true, plan }, null, 2));
}

main().catch((error) => {
  console.error(`[community-import] ${error.message}`);
  process.exit(1);
});
