# AGENTS.md — apps/collab-relay/

The standalone BYO collab relay (Phase 8 Stage 7). Not part of the Angular app or the Electron desktop build — a separate deployable unit a user self-hosts and points their desktop app at via a relay URL in Settings › Tools › Markdown Workspace (or a per-workspace override). DUDE itself never runs an instance of this (see `DUDE_PRD.md` §5.2's amended non-goals note).

## The rule

Same as `apps/desktop/AGENTS.md`'s "two build targets" precedent: plain TypeScript, its own `tsconfig.json`, compiled by `esbuild` (`npm run relay:compile`), never pulled into `tsconfig.app.json`. Shares `packages/collab-protocol/src/room.ts` with `apps/desktop/collab-server.ts` for the actual Yjs protocol logic — see `packages/collab-protocol/src/AGENTS.md` for what belongs there versus here. Everything HTTP/room-registry/session-code-specific to being a multi-tenant relay (as opposed to Stage 6's one-room-per-desktop-session server) belongs in `apps/collab-relay/server.ts`, not `packages/collab-protocol/src/room.ts`.

## Running it

- `npm run relay:dev` — compile + run locally against `PORT` (default 8080).
- `docker build -f apps/collab-relay/Dockerfile -t dude-collab-relay .` (from the repo root) + `docker run -p 8080:8080 dude-collab-relay` — the actual self-hosting path.

## Security posture

Ships `ws://` (unencrypted) by default — a self-hoster exposing this beyond their own LAN is responsible for TLS termination (a reverse proxy), not something this code does itself. Treat every self-hosted relay as untrusted from the app's perspective: it only ever carries Yjs CRDT sync/awareness bytes, never anything the app should execute or extend trust based on.
