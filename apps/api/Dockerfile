# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# WallHaze API (Fastify) — also the base for the Worker image.
#
# Build context is the REPOSITORY ROOT:
#   docker build -f apps/api/Dockerfile .
#
# REPO FACTS (verified 2026-10-24):
#  - NOT an npm-workspaces monorepo; apps/api has its own lockfile.
#  - "@wallhaze/contracts" is VALUE-imported at runtime. It is compiled in a
#    dedicated stage and copied into node_modules (compiling it inside the
#    API's node_modules via npm corrupts the COPY layout — see git history).
#  - tsc emits dist/<common-root>/...; the root depends on the compile graph,
#    so the entry is located dynamically and recorded in .dist-entry.
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS contracts-build
WORKDIR /c/packages/contracts
COPY packages/contracts ./
RUN npm install --no-save typescript@5 --silent \
    && npx tsc -p tsconfig.build.json \
    && rm -rf node_modules package-lock.json

FROM node:22-bookworm-slim AS build
WORKDIR /build
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci
COPY --from=contracts-build /c/packages/contracts /build/node_modules/@wallhaze/contracts
COPY apps/api ./apps/api
WORKDIR /build/apps/api
RUN npx tsc -p tsconfig.build.json && node scripts/copy-assets.mjs \
    && DIST_ENTRY="$(find dist -name server.js | head -1)" \
    && test -n "$DIST_ENTRY" \
    && echo "$DIST_ENTRY" > .dist-entry && cat .dist-entry

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /build/node_modules/@wallhaze ./node_modules/@wallhaze
COPY --from=build /build/apps/api/dist ./dist
COPY --from=build /build/apps/api/assets ./assets
COPY --from=build /build/apps/api/package.json ./package.json
COPY --from=build /build/apps/api/migrations ./migrations
COPY --from=build /build/apps/api/.dist-entry ./.dist-entry

RUN groupadd --system wallhaze && useradd --system --gid wallhaze wallhaze \
    && chown -R wallhaze:wallhaze /app
USER wallhaze

EXPOSE 4000
ENV NODE_OPTIONS=--max-old-space-size=512
CMD ["sh", "-c", "node \"$(cat .dist-entry)\""]
