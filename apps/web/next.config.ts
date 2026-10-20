import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Wraps the config so next-intl's compiler support is applied. The plugin
// picks up i18n/request.ts by convention; cacheComponents stays enabled.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
