# AGENTS.md — packages/collab-protocol/src/

The Yjs sync/awareness room logic shared between `apps/desktop/collab-server.ts` (Phase 8 Stage 6) and `apps/collab-relay/` (Stage 7) — two separate Node processes, neither of which is `apps/web/src/app/` or `apps/desktop/` itself, so this lives outside both. `apps/web/src/shared-logic/` is a different thing: that's for logic shared between the browser renderer and `apps/desktop/`; this is Node-to-Node.

## Rules

- No Electron imports (`electron` package) — this must stay usable by the standalone `apps/collab-relay/` deployable, which never runs inside Electron.
- No HTTP/room-registry/session-code logic here — `room.ts` only knows how to run one room's Yjs protocol over WebSocket connections handed to it. Room lookup, session-code checking, and the HTTP server itself belong to each consumer (`apps/desktop/collab-server.ts`'s one fixed room; `apps/collab-relay/server.ts`'s multi-room registry keyed by URL path).
- Compiled by `apps/desktop/tsconfig.json` (via its `rootDir`/`include` reaching outside `apps/desktop/`) for the Electron build, and bundled directly by `apps/collab-relay/`'s own esbuild step for the standalone relay — keep it dependency-light (`ws`, `yjs`, `y-protocols`, `lib0` only) so both bundles stay small.
