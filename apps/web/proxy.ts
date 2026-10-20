import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Next.js 16 proxy convention (replaces the deprecated middleware.ts).
 * next-intl's middleware handles locale detection/ negotiation and rewrites
 * `/` ↔ default locale without prefix (localePrefix: "as-needed").
 *
 * The matcher excludes API route handlers, Next.js internals and any file
 * with an extension. The web app owns no business API routes in the
 * separated architecture (T04-S1); the api exclusion keeps the matcher
 * future-proof and never touches static assets.
 */
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
