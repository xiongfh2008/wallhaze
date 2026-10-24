import themesJson from "@/data/community/themes.json";
import { findStyle, type StyleId } from "@/lib/styles";
import type { DeviceCategory } from "@/lib/media";
import { buildStudioRestoreHref } from "@/lib/studio/restore";

export type ThemeConfigStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "ended"
  | "disabled";

export type ThemeEffectiveStatus =
  | "hidden"
  | "scheduled"
  | "active"
  | "ended";

export interface CommunityTheme {
  id: string;
  slug: string;
  titleKey: string;
  descriptionKey: string;
  inspirationKey: string;
  coverAltKey: string;
  coverImage: string;
  recommendedStyleIds: StyleId[];
  supportedMediaTypes: Array<"image" | "video">;
  supportedDevices: DeviceCategory[];
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: ThemeConfigStatus;
  submissionEmail: string;
  publishedWorkIds: string[];
}

export const COMMUNITY_THEMES = themesJson.themes as CommunityTheme[];

export function findTheme(themeId: string): CommunityTheme | undefined {
  return COMMUNITY_THEMES.find((theme) => theme.id === themeId);
}

/**
 * Resolve the visible state from both the explicit config status and the
 * configured time window. `draft` and `disabled` never become public.
 * A `scheduled` theme becomes active automatically when its start passes.
 */
export function resolveThemeStatus(
  theme: CommunityTheme,
  now: Date
): ThemeEffectiveStatus {
  if (theme.status === "draft" || theme.status === "disabled") return "hidden";
  if (theme.status === "ended") return "ended";
  const start = Date.parse(theme.startsAt);
  const end = Date.parse(theme.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return "hidden";
  }
  const time = now.getTime();
  if (time < start) return "scheduled";
  if (time > end) return "ended";
  return "active";
}

/** First active theme, newest start first. The config should contain at most one. */
export function getActiveTheme(
  themes: readonly CommunityTheme[],
  now: Date
): CommunityTheme | null {
  return (
    [...themes]
      .filter((theme) => resolveThemeStatus(theme, now) === "active")
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0] ?? null
  );
}

/** Ended themes; the caller must still filter to themes that actually have works. */
export function getEndedThemes(
  themes: readonly CommunityTheme[],
  now: Date
): CommunityTheme[] {
  return themes.filter((theme) => resolveThemeStatus(theme, now) === "ended");
}

/** Drop unknown style ids instead of rendering an unsafe/broken Studio link. */
export function validRecommendedStyles(theme: CommunityTheme): StyleId[] {
  return theme.recommendedStyleIds.filter((id) => Boolean(findStyle(id)));
}

export function themeCoverIsPublic(theme: CommunityTheme): boolean {
  return (
    theme.coverImage.startsWith("/images/") ||
    theme.coverImage.startsWith("/videos/")
  );
}

export function themeSubmissionMailto(
  theme: CommunityTheme,
  localizedTitle: string
): string {
  const subject = `[WallHaze Monthly Theme] ${localizedTitle}`;
  const body = `主题名称：${localizedTitle}
作品名称：
作者昵称：
作品类型：静态 / 动态
适配设备：手机 / 平板 / 电脑
作品介绍：
作品创作方式：
所使用的素材及授权来源：
是否允许公开下载：
授予 WallHaze 的展示及下载许可范围：
作者署名方式：

请附上作品文件或安全的下载链接。`;
  return `mailto:${theme.submissionEmail}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

export function themeStudioHref(
  theme: CommunityTheme,
  localizedInspiration: string,
  device: DeviceCategory | null = null,
  styleIdOverride: StyleId | null = null
): string {
  const recommended = validRecommendedStyles(theme);
  const styleId =
    styleIdOverride && recommended.includes(styleIdOverride)
      ? styleIdOverride
      : recommended[0] ?? null;
  return buildStudioRestoreHref({
    prompt: localizedInspiration,
    styleId,
    device: device ?? "",
  });
}

export function formatThemeDate(
  iso: string,
  locale: string,
  timezone: string
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(date);
}
