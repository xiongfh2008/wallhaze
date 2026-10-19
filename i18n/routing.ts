import { defineRouting } from "next-intl/routing";

/**
 * Single source of truth for the supported languages.
 *
 * - "en" is the default and stays prefix-free (`/`, `/studio`) — the URLs
 *   that existed before i18n keep working unchanged.
 * - "zh" (Simplified Chinese) is served under `/zh`, `/zh/studio`.
 * - "ja" (Japanese) is served under `/ja`, `/ja/studio`.
 * - "ko" (Korean) is served under `/ko`, `/ko/studio`.
 * - "es" (Spanish) is served under `/es`, `/es/studio`.
 * - "fr" (French) is served under `/fr`, `/fr/studio`.
 * - "de" (German) is served under `/de`, `/de/studio`.
 *
 * Verified against Next.js 16.4 + cacheComponents in the stage-0 spike:
 * `localePrefix: "as-needed"` renders the default locale without a prefix
 * and leaves unknown locales to 404 correctly.
 */
export const routing = defineRouting({
  locales: ["en", "zh", "ja", "ko", "es", "fr", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

/** BCP 47 value used for `<html lang>` — richer than the routing segment. */
export const HTML_LANG: Record<Locale, string> = {
  en: "en",
  zh: "zh-CN",
  ja: "ja",
  ko: "ko",
  es: "es",
  fr: "fr",
  de: "de",
};
