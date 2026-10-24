import authorsJson from "@/data/community/authors.json";
import worksJson from "@/data/community/works.json";
import { nativeDeviceFor, type DeviceCategory } from "@/lib/media";
import { WALLPAPER_STYLES, type StyleId } from "@/lib/styles";
import { findTheme, type CommunityTheme } from "@/lib/community/themes";

/** The only public submission channel. No form, API or upload exists. */
export const COMMUNITY_EMAIL = "xiongfh2000@gmail.com";
export const COMMUNITY_SUBMISSION_SUBJECT = "WallHaze Wallpaper Submission";

/**
 * Keep the submission format stable for the reviewer. This text is copied
 * into the user's own mail client; nothing is sent by WallHaze.
 */
export const COMMUNITY_SUBMISSION_BODY = `作品名称：
作者昵称：
作品类型：静态 / 动态
适配设备：手机 / 平板 / 电脑
作品说明：
创作方式：原创 / AI 辅助 / AI 生成
作品来源及素材授权：
是否允许公开下载：是 / 否
拟授权的展示、下载及使用范围：
作者署名方式：
联系邮箱：

请将壁纸文件作为邮件附件，或提供安全的文件下载链接。`;

export type CommunityOrigin = "community_submission" | "demo_seed";
export type CommunityStatus =
  | "draft"
  | "reviewed"
  | "published"
  | "withdrawn"
  | "rejected";
export type CommunityMediaType = "image" | "video";
export type CommunitySourceType =
  | "original"
  | "ai-assisted"
  | "ai-generated"
  | "demo-local-cc0"
  | "demo-local-self";
export type CommunityLicenseType =
  | "CC0-1.0"
  | "CC-BY-4.0"
  | "CC-BY-SA-4.0"
  | "self-authored"
  | "personal-use"
  | "all-rights-reserved"
  | "custom";
export type CommunityDownloadScope =
  | "cc0"
  | "self-authored"
  | "personal-use"
  | "custom";

export interface CommunityAuthor {
  authorId: string;
  name: string;
  nameKey: string | null;
  bio: string | null;
  bioKey: string | null;
  avatarAsset: string | null;
  socialUrl: string | null;
  isDemo: boolean;
}

export interface CommunityWork {
  id: string;
  slug: string;
  origin: CommunityOrigin;
  status: CommunityStatus;
  title: string;
  description: string;
  titleKey: string | null;
  descriptionKey: string | null;
  authorId: string;
  author: CommunityAuthor;
  themeId: string | null;
  mediaType: CommunityMediaType;
  styleId: StyleId;
  deviceType: DeviceCategory;
  width: number;
  height: number;
  aspectRatio: number;
  durationSeconds: number | null;
  sourceType: CommunitySourceType;
  sourceDescription: string;
  sourceDescriptionKey: string | null;
  licenseType: CommunityLicenseType;
  licenseUrl: string | null;
  allowPublicDisplay: boolean;
  allowDownload: boolean;
  downloadLicense: CommunityLicenseType;
  downloadScope: CommunityDownloadScope;
  downloadScopeNote: string | null;
  reviewedAt: string;
  publishedAt: string;
  featured: boolean;
  previewAsset: string;
  posterAsset: string | null;
  downloadAsset: string | null;
}

interface RawWork {
  id: string;
  slug: string;
  origin: CommunityOrigin;
  status: CommunityStatus;
  title: string;
  description: string;
  titleKey?: string | null;
  descriptionKey?: string | null;
  authorId: string;
  themeId?: string | null;
  mediaType: CommunityMediaType;
  styleId: StyleId;
  deviceType: DeviceCategory;
  width: number;
  height: number;
  durationSeconds?: number | null;
  sourceType: CommunitySourceType;
  sourceDescription?: string;
  sourceDescriptionKey?: string | null;
  licenseType: CommunityLicenseType;
  licenseUrl?: string | null;
  allowPublicDisplay: boolean;
  allowDownload: boolean;
  downloadLicense: CommunityLicenseType;
  downloadScope: CommunityDownloadScope;
  downloadScopeNote?: string | null;
  reviewedAt: string;
  publishedAt: string;
  featured?: boolean;
  previewAsset: string;
  posterAsset?: string | null;
  downloadAsset?: string | null;
}

const STYLE_IDS = new Set<string>(WALLPAPER_STYLES.map((style) => style.id));
const ORIGINS = new Set<CommunityOrigin>(["community_submission", "demo_seed"]);
const MEDIA_TYPES = new Set<CommunityMediaType>(["image", "video"]);
const STATUSES = new Set<CommunityStatus>([
  "draft",
  "reviewed",
  "published",
  "withdrawn",
  "rejected",
]);
const SOURCE_TYPES = new Set<CommunitySourceType>([
  "original",
  "ai-assisted",
  "ai-generated",
  "demo-local-cc0",
  "demo-local-self",
]);
const LICENSE_TYPES = new Set<CommunityLicenseType>([
  "CC0-1.0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "self-authored",
  "personal-use",
  "all-rights-reserved",
  "custom",
]);
const DEVICE_TYPES = new Set<DeviceCategory>(["phone", "tablet", "desktop"]);

/** Public asset paths only; private-directory paths are never valid in data. */
export function isPublicCommunityAsset(path: unknown): path is string {
  if (typeof path !== "string" || !path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("..") || path.includes("\\")) return false;
  if (path.startsWith("/private") || path.includes("private-media")) return false;
  return (
    path.startsWith("/community/") ||
    path.startsWith("/community-demo/") ||
    path.startsWith("/images/") ||
    path.startsWith("/videos/")
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[community] ${message}`);
}

function publicAuthor(raw: {
  authorId: string;
  name: string;
  nameKey?: string | null;
  bio?: string | null;
  bioKey?: string | null;
  avatarAsset?: string | null;
  socialUrl?: string | null;
  isDemo?: boolean;
}): CommunityAuthor {
  assert(raw.authorId.trim().length > 0, "authorId is required");
  assert(raw.name.trim().length > 0, `author ${raw.authorId} needs a public name`);
  assert(
    raw.avatarAsset === null ||
      raw.avatarAsset === undefined ||
      isPublicCommunityAsset(raw.avatarAsset),
    `author ${raw.authorId} has an unsafe avatar`
  );
  assert(
    raw.socialUrl === null ||
      raw.socialUrl === undefined ||
      /^https:\/\//.test(raw.socialUrl),
    `author ${raw.authorId} has a non-HTTPS social URL`
  );
  return {
    authorId: raw.authorId,
    name: raw.name,
    nameKey: raw.nameKey ?? null,
    bio: raw.bio ?? null,
    bioKey: raw.bioKey ?? null,
    avatarAsset: raw.avatarAsset ?? null,
    socialUrl: raw.socialUrl ?? null,
    isDemo: raw.isDemo === true,
  };
}

const AUTHORS = new Map(
  (authorsJson.authors as Array<Parameters<typeof publicAuthor>[0]>).map(
    (author) => {
      const normalized = publicAuthor(author);
      return [normalized.authorId, normalized] as const;
    }
  )
);

/**
 * Validates one public work record. Invalid records throw at import/build
 * rather than silently rendering a half-published community card.
 */
export function normalizeCommunityWork(raw: RawWork): CommunityWork {
  assert(typeof raw.id === "string" && raw.id.length > 0, "id is required");
  assert(
    typeof raw.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.slug),
    `${raw.id}: invalid slug`
  );
  assert(ORIGINS.has(raw.origin), `${raw.id}: invalid origin`);
  assert(STATUSES.has(raw.status), `${raw.id}: invalid status`);
  assert(MEDIA_TYPES.has(raw.mediaType), `${raw.id}: invalid mediaType`);
  assert(STYLE_IDS.has(raw.styleId), `${raw.id}: unknown styleId ${raw.styleId}`);
  assert(DEVICE_TYPES.has(raw.deviceType), `${raw.id}: invalid deviceType`);
  assert(SOURCE_TYPES.has(raw.sourceType), `${raw.id}: invalid sourceType`);
  assert(LICENSE_TYPES.has(raw.licenseType), `${raw.id}: invalid licenseType`);
  assert(
    LICENSE_TYPES.has(raw.downloadLicense),
    `${raw.id}: invalid downloadLicense`
  );
  assert(
    Number.isInteger(raw.width) && raw.width > 0,
    `${raw.id}: width must be a positive integer`
  );
  assert(
    Number.isInteger(raw.height) && raw.height > 0,
    `${raw.id}: height must be a positive integer`
  );
  assert(
    nativeDeviceFor(raw.width, raw.height) === raw.deviceType,
    `${raw.id}: deviceType does not match actual dimensions`
  );
  assert(
    isPublicCommunityAsset(raw.previewAsset),
    `${raw.id}: previewAsset must be public`
  );
  if (raw.mediaType === "video") {
    assert(
      typeof raw.durationSeconds === "number" &&
        Number.isFinite(raw.durationSeconds) &&
        raw.durationSeconds > 0,
      `${raw.id}: video durationSeconds is required`
    );
    assert(
      isPublicCommunityAsset(raw.posterAsset),
      `${raw.id}: video posterAsset must be public`
    );
  } else {
    assert(
      raw.durationSeconds === null ||
        raw.durationSeconds === undefined ||
        raw.durationSeconds === 0,
      `${raw.id}: static works cannot have a duration`
    );
    assert(
      raw.posterAsset === null || raw.posterAsset === undefined,
      `${raw.id}: static works cannot have a poster`
    );
  }
  if (raw.allowDownload) {
    assert(
      isPublicCommunityAsset(raw.downloadAsset),
      `${raw.id}: downloadable work needs a public downloadAsset`
    );
    if (raw.origin === "community_submission") {
      assert(
        raw.downloadLicense !== "all-rights-reserved" &&
          raw.downloadLicense !== "custom",
        `${raw.id}: download permission needs a concrete licence`
      );
    } else {
      assert(
        typeof raw.downloadScopeNote === "string" &&
          raw.downloadScopeNote.trim().length > 0,
        `${raw.id}: demo download permission needs an explicit scope note`
      );
    }
    assert(
      raw.downloadScope === "cc0" ||
        raw.downloadScope === "self-authored" ||
        raw.downloadScope === "personal-use" ||
        raw.downloadScope === "custom",
      `${raw.id}: invalid downloadScope`
    );
  } else {
    assert(
      raw.downloadAsset === null || raw.downloadAsset === undefined,
      `${raw.id}: view-only work must not expose a downloadAsset`
    );
  }
  if (raw.status === "published") {
    assert(raw.allowPublicDisplay, `${raw.id}: published work must allow display`);
  }
  const author = AUTHORS.get(raw.authorId);
  assert(author, `${raw.id}: unknown authorId ${raw.authorId}`);
  if (raw.origin === "community_submission") {
    assert(
      raw.previewAsset.startsWith("/community/"),
      `${raw.id}: submission assets must live under /community/`
    );
  }
  if (raw.origin === "demo_seed") {
    assert(
      /^demo-\d+$/.test(raw.slug),
      `${raw.id}: demo slug must look like demo-00N`
    );
    assert(
      raw.previewAsset.startsWith("/community-demo/") ||
        raw.previewAsset.startsWith("/images/") ||
        raw.previewAsset.startsWith("/videos/"),
      `${raw.id}: demo previewAsset must be a demo or already-cleared asset`
    );
    assert(
      author.isDemo,
      `${raw.id}: demo works must use the demo author`
    );
  } else {
    assert(
      !author.isDemo,
      `${raw.id}: real submissions must not use the demo author`
    );
  }
  assert(
    raw.titleKey === null ||
      raw.titleKey === undefined ||
      /^[a-zA-Z0-9._-]+$/.test(raw.titleKey),
    `${raw.id}: invalid titleKey`
  );
  assert(
    raw.descriptionKey === null ||
      raw.descriptionKey === undefined ||
      /^[a-zA-Z0-9._-]+$/.test(raw.descriptionKey),
    `${raw.id}: invalid descriptionKey`
  );
  if (raw.themeId) {
    assert(findTheme(raw.themeId), `${raw.id}: unknown themeId ${raw.themeId}`);
  }

  return {
    ...raw,
    themeId: raw.themeId ?? null,
    titleKey: raw.titleKey ?? null,
    descriptionKey: raw.descriptionKey ?? null,
    durationSeconds: raw.mediaType === "video" ? raw.durationSeconds ?? null : null,
    sourceDescription: raw.sourceDescription ?? "",
    sourceDescriptionKey: raw.sourceDescriptionKey ?? null,
    licenseUrl: raw.licenseUrl ?? null,
    downloadScopeNote: raw.downloadScopeNote ?? null,
    posterAsset: raw.posterAsset ?? null,
    downloadAsset: raw.downloadAsset ?? null,
    featured: raw.featured === true,
    author,
    aspectRatio: raw.width / raw.height,
  };
}

const ALL_WORKS = (worksJson.works as RawWork[]).map(normalizeCommunityWork);

/** Only explicitly published + displayable works can reach any public page. */
export function isPubliclyPublished(work: CommunityWork): boolean {
  return work.status === "published" && work.allowPublicDisplay === true;
}

export const COMMUNITY_WORKS: readonly CommunityWork[] = [...ALL_WORKS]
  .filter(isPubliclyPublished)
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

export function getCommunityWorks(): readonly CommunityWork[] {
  return COMMUNITY_WORKS;
}

export function getSubmissionWorks(): readonly CommunityWork[] {
  return COMMUNITY_WORKS.filter(
    (work) => work.origin === "community_submission"
  );
}

export function getCommunityWorkBySlug(slug: string): CommunityWork | undefined {
  return COMMUNITY_WORKS.find((work) => work.slug === slug);
}

export function getRelatedCommunityWorks(
  work: CommunityWork,
  limit = 4
): CommunityWork[] {
  return COMMUNITY_WORKS.filter(
    (candidate) =>
      candidate.id !== work.id &&
      (candidate.styleId === work.styleId ||
        candidate.mediaType === work.mediaType)
  ).slice(0, limit);
}

export function getThemeFeaturedWorks(theme: CommunityTheme): CommunityWork[] {
  const ids = new Set(theme.publishedWorkIds);
  return COMMUNITY_WORKS.filter(
    (work) =>
      work.origin === "community_submission" &&
      work.themeId === theme.id &&
      ids.has(work.id)
  );
}

export function getCommunityAuthor(authorId: string): CommunityAuthor | undefined {
  return AUTHORS.get(authorId);
}

export function submissionMailto(): string {
  return `mailto:${COMMUNITY_EMAIL}?subject=${encodeURIComponent(
    COMMUNITY_SUBMISSION_SUBJECT
  )}&body=${encodeURIComponent(COMMUNITY_SUBMISSION_BODY)}`;
}

export function reportMailto(title: string, url: string): string {
  const subject = `WallHaze Community Report — ${title}`;
  const body = `作品名称 / Work title: ${title}
作品链接 / Work URL: ${url}
问题说明 / Problem:
相关权利证明 / Rights evidence (if any):`;
  return `mailto:${COMMUNITY_EMAIL}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}
