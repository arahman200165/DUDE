# Standalone BYO collab relay (Phase 8 Stage 7) — self-hosted, not run by
# DUDE. Build: `docker build -f apps/collab-relay/Dockerfile -t dude-collab-relay .`
# (from the repo root, so the build context includes packages/collab-protocol).
# Run:   `docker run -p 8080:8080 dude-collab-relay`
# Ships ws:// (unencrypted) — put a TLS-terminating reverse proxy in front
# if exposing this beyond your own LAN.
#
# Every workspace package.json must be copied before `npm ci` or the lockfile
# no longer matches; `npm run check:dockerfiles` enforces this.

FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g npm@11.19.0
COPY package.json package-lock.json .npmrc ./
COPY apps/collab-relay/package.json ./apps/collab-relay/package.json
COPY apps/desktop/package.json ./apps/desktop/package.json
COPY apps/device-agent/package.json ./apps/device-agent/package.json
COPY apps/hub/package.json ./apps/hub/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/agent-pipe/package.json ./packages/agent-pipe/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/collab-protocol/package.json ./packages/collab-protocol/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/crypto/package.json ./packages/crypto/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/hub-backup/package.json ./packages/hub-backup/package.json
COPY packages/persistence/package.json ./packages/persistence/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/sqlite-store/package.json ./packages/sqlite-store/package.json
COPY packages/sync/package.json ./packages/sync/package.json
COPY packages/tool-engine/package.json ./packages/tool-engine/package.json
COPY packages/tool-registry/package.json ./packages/tool-registry/package.json
COPY packages/validation/package.json ./packages/validation/package.json
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.packages.json ./
COPY packages ./packages
COPY apps/collab-relay ./apps/collab-relay
RUN npm run build --workspace=@dude/collab-protocol
RUN npx esbuild apps/collab-relay/index.ts --bundle --platform=node --format=cjs --outfile=dist/relay.js

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist/relay.js ./relay.js
ENV PORT=8080
EXPOSE 8080
CMD ["node", "relay.js"]
