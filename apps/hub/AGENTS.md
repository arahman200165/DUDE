# AGENTS.md — apps/hub/

The self-hosted **DUDE Hub** (Phase 31C): the user's own authoritative service for owner identity, the device registry and, from Phase 31D, canonical synchronized state. It runs independently of Electron, as a Windows service, a Docker container or a foreground process. DUDE never operates an instance. Decisions: PD-023 to PD-037 in the [decision log](../../docs/history/DECISION_LOG.md#phase-31c-implementation-decisions). Implementation is landing across Milestones 630-649; until each milestone ships, treat the layout below as the plan, not a description of existing code.

## The rules

- Plain TypeScript with its own `tsconfig.json`, compiled by `esbuild` to a CJS bundle and packaged as a Node 24 single-executable application. Never pulled into `tsconfig.app.json`.
- Never import `electron`, `@angular/*`, `apps/web`, `@dude/device-agent` or `@dude/desktop`. Shared code comes only from portable packages, plus the Node-only `@dude/sqlite-store`.
- The Hub process is the only writer of `data/dude.db`. CLI commands that need state go through the local admin named pipe while the service runs; they never open the database.
- Every route has a TypeBox schema (request and response), declares its credential type (none, setup token, owner cookie session, owner bearer session, device token), and writes an audit event. A device credential alone never grants owner rights.
- HTTPS only. No listener on a non-loopback address unless LAN mode is on (installer checkbox or elevated `dude-hub network lan on|off`) or container mode is set.
- Never log or audit credentials, tokens, recovery codes, keys or request payloads.
- Destructive Hub actions (`purge`, owner reset, revoke-all, certificate rotation with `--force`) follow the Destructive-Action Contract with the server-side ConfirmationStore.
- Schema changes are new numbered migrations only; a shipped migration is never edited, and `minReaderVersion` makes older Hubs refuse a newer database.

## Planned layout

- `src/server/` Fastify app, TLS and listener, static/SPA hosting (never rewrites `/api/*`), security headers and limits.
- `src/db/` canonical SQLite repositories, migrations, the atomic commit repository.
- `src/auth/` owner password, recovery codes, setup token, cookie and bearer sessions, throttling.
- `src/devices/` pairing codes, device keys and tokens, the registry.
- `src/realtime/` the authenticated WebSocket at `/api/v1/realtime`.
- `src/cli/` `run`, `setup-token`, `owner reset`, `network lan`, `tls rotate`, `service`, `doctor`, `purge`.

## Scope ceilings in 31C

No synchronization, public record endpoints or Yjs (31D/31J), no authenticated shared-state Hub web or Hub web caching (31E), no trusted-CA/reverse-proxy/public mode (31E/31F), no backup (31G).
