import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Next.js 16 proxy convention (replaces the deprecated middleware.ts).
 * next-intl's middleware handles locale detection/ negotiation and rewrites
 * `/` ↔ default locale without prefix (localePrefix: "as-needed").
 *
 * The matcher excludes API route handlers, Next.js internals and any file
 * with an extension, so /api/generate, /api/image and static assets are
 * never touched by locale routing.
 */
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
