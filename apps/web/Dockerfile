# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# WallHaze Web (Next.js 16, standalone output).
#
# Build context is the REPOSITORY ROOT. next.config.ts declares
# output: "standalone" (added for containerization) so .next/standalone
# contains a minimal server tree with its own node_modules.
# ---------------------------------------------------------------------------

# Turbopack pins its workspace root to the nearest lockfile around the app
# directory; installing deps INSIDE /build/apps/web keeps node_modules within
# that root, so the production build stays hermetic.
FROM node:22-bookworm-slim AS build
WORKDIR /build/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
# contracts: tsconfig paths point at ../../packages/contracts; web imports it
# as a VALUE (IMAGE_PROXY_ERRORS host allowlist copy), so ship compiled dist.
# vendor/contracts is synced into the app tree (scripts/sync-vendor-contracts.mjs)
# and committed to the build context; turbopack compiles it inside the root.
# demo-works is deliberately EXCLUDED from production builds (demo isolation);
# lib/community/demo.ts tolerates an empty file at build time.
RUN mkdir -p /build/apps/web/data/community \
    && echo '{"version":1,"works":[]}' > /build/apps/web/data/community/demo-works.json
# data referenced via relative imports from lib/ (@/data/...).
COPY apps/web/data /build/apps/web/data
COPY apps/web/messages /build/apps/web/messages
COPY apps/web/i18n /build/apps/web/i18n
COPY apps/web .
# NEXT_PUBLIC_API_BASE_URL is baked into the client bundle at build time.
# Compose passes it as a build arg (same origin in production: empty means
# same-origin relative URLs through the reverse proxy).
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
# Node-container deploys keep the standalone server tree.
ENV DEPLOY_TARGET=node
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# standalone server + static assets (per Next.js output documentation).
COPY --from=build /build/apps/web/.next/standalone ./
COPY --from=build /build/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /build/apps/web/public ./apps/web/public

RUN groupadd --system wallhaze && useradd --system --gid wallhaze wallhaze \
    && chown -R wallhaze:wallhaze /app
USER wallhaze

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Next.js server is mostly I/O; keep the heap modest for the 8 GB VPS.
ENV NODE_OPTIONS=--max-old-space-size=512
CMD ["node", "server.js"]
