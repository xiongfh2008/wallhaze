/**
 * Message namespaces consumed exclusively by server components (metadata,
 * legal pages, content pages). Stripping them from NextIntlClientProvider
 * keeps their translations out of the RSC payload / inline bootstrap of
 * every page, so legal copy is only ever rendered on the server and the
 * client payload only carries namespaces client components actually use.
 *
 * Verified 2026-11-01: no client component calls useTranslations() with any
 * namespace in this list (grep over apps/web components). When adding a
 * client component that needs one of these, move the namespace out of the
 * list and re-run tests/waffo-review.test.ts.
 */
export const SERVER_ONLY_NAMESPACES = [
  "meta",
  "terms",
  "privacy",
  "aup",
  "about",
  "faq",
  "help",
  "contact",
  "pricing",
] as const;

/** Filter out the server-only namespaces from a messages object. */
export function stripServerOnlyNamespaces(
  messages: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(messages).filter(
      ([namespace]) =>
        !(SERVER_ONLY_NAMESPACES as readonly string[]).includes(namespace)
    )
  );
}
