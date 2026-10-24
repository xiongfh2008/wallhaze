import { bindings, defineConfig, defineWorker } from "cf/config";

// Production routes: wallhaze.com (+ www -> redirect handled by a separate
// redirect rule or Cloudflare Bulk Redirect; set via `routes` at deploy time
// by the operator — the config below is the worker itself).
export default defineConfig({
  worker: defineWorker({
    name: "wallhaze-web",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-24",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
    },
  }),
});
