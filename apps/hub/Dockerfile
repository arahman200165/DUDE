# DUDE Hub container image (Phase 31C) — self-hosted, never run by DUDE.
# Build (from the repo root):  docker build -f apps/hub/Dockerfile -t dude-hub .
# Run:    docker run -d --name dude-hub -p 127.0.0.1:47600:47600 -v dude-hub:/data dude-hub
# Setup:  docker exec dude-hub node /opt/dude-hub/dude-hub.cjs setup-token
# The Hub serves HTTPS with a self-signed certificate it creates under /data/config/tls;
# only publish the port beyond loopback deliberately (container bind mode listens on all interfaces).
#
# Multi-stage: the build stage compiles the Hub and the Angular hub web build; the runtime stage carries only
# dude-hub.cjs and service/web (the Hub's default web root, /opt/dude-hub/service/web).
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
COPY apps/web/package.json ./apps/web/package.json
COPY packages/agent-pipe/package.json ./packages/agent-pipe/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/collab-protocol/package.json ./packages/collab-protocol/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/crypto/package.json ./packages/crypto/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/persistence/package.json ./packages/persistence/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/sqlite-store/package.json ./packages/sqlite-store/package.json
COPY packages/sync/package.json ./packages/sync/package.json
COPY packages/tool-engine/package.json ./packages/tool-engine/package.json
COPY packages/tool-registry/package.json ./packages/tool-registry/package.json
COPY packages/validation/package.json ./packages/validation/package.json
RUN npm ci --ignore-scripts
# The Angular Hub configuration needs the whole source tree: generate:registry reads README.md, SECURITY.md,
# docs/, tests/ and build/ inputs besides apps/web and packages. .dockerignore keeps node_modules, dist and .git out.
COPY . .
RUN npm run build:hub-web
RUN node scripts/build-hub.mjs
# Precompress the web build (.br/.gz siblings) for the Hub's static handler; the runtime image has no web UI without it.
RUN node scripts/compress-static.mjs dist/hub-web/browser
RUN test -f dist/hub-web/browser/index.html  && mkdir -p /out/service  && cp dist/hub/dude-hub.cjs /out/  && cp -r dist/hub-web/browser /out/service/web

FROM node:24-alpine
RUN addgroup -g 10001 dude && adduser -D -u 10001 -G dude dude  && mkdir -p /data /opt/dude-hub && chown dude:dude /data
COPY --from=build /out/ /opt/dude-hub/
COPY apps/hub/healthcheck.cjs /opt/dude-hub/healthcheck.cjs
USER dude
ENV DUDE_HUB_DATA_DIR=/data
VOLUME /data
EXPOSE 47600
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD ["node", "/opt/dude-hub/healthcheck.cjs"]
ENTRYPOINT ["node", "/opt/dude-hub/dude-hub.cjs", "run", "--bind", "container"]
