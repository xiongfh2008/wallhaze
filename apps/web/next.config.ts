import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Wraps the config so next-intl's compiler support is applied. The plugin
// picks up i18n/request.ts by convention; cacheComponents stays enabled.
const withNextIntl = createNextIntlPlugin();

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
};

export default withNextIntl(nextConfig);
