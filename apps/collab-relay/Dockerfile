# Standalone BYO collab relay (Phase 8 Stage 7) — self-hosted, not run by
# DUDE. Build: `docker build -f apps/collab-relay/Dockerfile -t dude-collab-relay .`
# (from the repo root, so the build context includes packages/collab-protocol).
# Run:   `docker run -p 8080:8080 dude-collab-relay`
# Ships ws:// (unencrypted) — put a TLS-terminating reverse proxy in front
# if exposing this beyond your own LAN.

FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g npm@11.19.0
COPY package.json package-lock.json ./
COPY apps/collab-relay/package.json ./apps/collab-relay/package.json
COPY apps/desktop/package.json ./apps/desktop/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages ./packages
RUN npm ci
COPY apps/collab-relay ./apps/collab-relay
COPY tsconfig.packages.json ./
RUN npm run build --workspace=@dude/collab-protocol
RUN npx esbuild apps/collab-relay/index.ts --bundle --platform=node --format=cjs --outfile=dist/relay.js

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist/relay.js ./relay.js
ENV PORT=8080
EXPOSE 8080
CMD ["node", "relay.js"]
