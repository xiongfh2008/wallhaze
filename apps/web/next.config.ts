import path from "node:path";
import type { NextConfig } from "next";

// next-intl WITHOUT the plugin wrapper (P0 fix for the Cloudflare Git build):
// merely importing next-intl/plugin loads its message-extraction chain, which
// pulls in the native @swc/core binding at config-evaluation time — on the
// Cloudflare build that crashed with "[vinext] Failed to load next.config.ts:
// Failed to load native binding" before any compile step ran.
//
// The plugin's ONLY function used by this app is the `next-intl/config`
// alias pointing at i18n/request.ts (next-intl/server imports that module id).
// It is provided here directly for both bundlers:
//  - vinext (Cloudflare build): auto-detects next-intl and registers the
//    alias itself; the wrapper was never needed (vinext prints exactly this
//    hint on config-load failures);
//  - next build (Turbopack, Next 16): turbopack.resolveAlias below — a
//    RELATIVE path, same shape the plugin would emit;
//  - next build (webpack fallback): absolute alias in the webpack fn.
// i18n/request.ts, the seven-locale routing and next-intl/server stay
// untouched. cacheComponents stays enabled.
const nextConfig: NextConfig = {
  // Turbopack workspace root: the container build places the app at
  // /build/apps/web with lockfile at /build/apps/web (app-local), but the
  // repo root also carries a lockfile; pin the root to the app dir so the
  // same config works in local dev and container builds.
  turbopack: {
    root: path.resolve(import.meta.dirname ?? "."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    // Replaces the next-intl/plugin alias (see the note above). Relative
    // path on purpose — absolute request-config paths are rejected by
    // Turbopack's next-intl integration.
    resolveAlias: {
      "next-intl/config": "./i18n/request.ts",
    },
  },
  // Webpack fallback so a non-Turbopack `next build` also resolves
  // `next-intl/config` without the plugin.
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "next-intl/config": path.resolve(
        import.meta.dirname ?? ".",
        "i18n/request.ts"
      ),
    };
    return config;
  },
  // Standalone output only for Node container deploys (DEPLOY_TARGET=node);
  // the Cloudflare Workers build (vinext) must NOT emit a standalone tree —
  // vinext's own Cloudflare output is used instead. Default (unset) is the
  // Cloudflare path.
  output: process.env.DEPLOY_TARGET === "node" ? "standalone" : undefined,
  // Keep the traced file set lean — media is served by the reverse proxy /
  // object storage, and the demo pipeline never runs in production.
  outputFileTracingExcludes: {
    "*": [
      "./public/community-demo/**",
      "./scripts/**",
      "./tests/**",
      "./.next/cache/**",
    ],
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Metadata must land in the initial <head>, never in a late RSC restore
  // segment. Next.js streams generateMetadata output for regular browsers
  // (React hoists it into <head> during hydration) and only blocks on it for
  // "HTML limited" crawlers. The Cloudflare/vinext HTML cache is UA-blind,
  // so whichever variant renders first is served to everyone — production
  // "/" shipped title/description/canonical inside a hidden S:0 segment,
  // which Lighthouse reports as "no meta description". Treating every UA as
  // HTML-limited forces blocking metadata for all clients; the cost is a
  // few ms of params + bundled message JSON before the first byte.
  htmlLimitedBots: /.*/,
};

export default nextConfig;
