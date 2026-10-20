import { routing, type Locale } from "@/i18n/routing";

/**
 * Shared SEO helpers — the single source of truth for canonical URLs,
 * hreflang alternates and Open Graph locales.
 *
 * URL shape mirrors next-intl `localePrefix: "as-needed"`: the default
 * locale (en) is served unprefixed, every other locale lives under /<locale>.
 */

export const SITE_URL = "https://wallhaze.com";

const LOCALE_PREFIX: Record<Locale, string> = {
  en: "",
  zh: "/zh",
  ja: "/ja",
  ko: "/ko",
  es: "/es",
  fr: "/fr",
  de: "/de",
};

export const OG_LOCALE: Record<Locale, string> = {
  en: "en_US",
  zh: "zh_CN",
  ja: "ja_JP",
  ko: "ko_KR",
  es: "es_ES",
  fr: "fr_FR",
  de: "de_DE",
};

/**
 * Absolute, canonical URL for `path` in the given locale.
 * The path is locale-agnostic ("/", "/studio", "/wallpapers/foo"); the
 * locale prefix is applied here. "/" normalizes to no trailing duplicate.
 */
export function absoluteLocaleUrl(locale: Locale, path: string): string {
  const suffix = path === "/" ? "" : path;
  return `${SITE_URL}${LOCALE_PREFIX[locale]}${suffix}`;
}

/**
 * hreflang alternates for one logical path: every supported locale plus
 * x-default (pointing at the default-locale URL, per Google's guidance for
 * unlanguage-matched pickers).
 */
export function languageAlternates(path: string): Record<string, string> {
  const entries: Array<[string, string]> = routing.locales.map((locale) => [
    locale,
    absoluteLocaleUrl(locale, path),
  ]);
  entries.push(["x-default", absoluteLocaleUrl("en", path)]);
  return Object.fromEntries(entries);
}
