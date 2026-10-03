# AGENTS.md — apps/hub/

The self-hosted **DUDE Hub** (Phase 31C, complete): the user's own authoritative service for owner identity, the device registry, sessions, audit and a canonical SQLite skeleton. It runs independently of Electron, as a Windows service, a Docker container or a foreground process. DUDE never operates an instance. Decisions: PD-023 to PD-037 in the [decision log](../../docs/history/DECISION_LOG.md#phase-31c-implementation-decisions) (amended for PD-025 and PD-026). Evidence: [Phase 31C acceptance](../../docs/delivery/PHASE31C_ACCEPTANCE.md).

## The rules

- Plain TypeScript with its own `tsconfig.json`, compiled by `esbuild` to a CJS bundle and packaged as a Node 24 single-executable application. Never pulled into `tsconfig.app.json`.
- Never import `electron`, `@angular/*`, `apps/web`, `@dude/device-agent` or `@dude/desktop`. Shared code comes only from portable packages, plus the Node-only `@dude/sqlite-store`.
- The Hub process is the only writer of `data/dude.db`. CLI commands that need state go through the local admin named pipe while the service runs; they never open the database.
- Every route has a TypeBox schema (request and response), declares its credential type (none, setup token, owner cookie session, owner bearer session, device token), and writes an audit event. A device credential alone never grants owner rights.
- HTTPS only. No listener on a non-loopback address unless LAN mode is on (installer checkbox or elevated `dude-hub network lan on|off`) or container mode is set.
- Never log or audit credentials, tokens, recovery codes, keys or request payloads.
- Destructive Hub actions (`purge`, owner reset, revoke-all, certificate rotation with `--force`) follow the Destructive-Action Contract with the server-side ConfirmationStore.
- Schema changes are new numbered migrations only; a shipped migration is never edited, and `minReaderVersion` makes older Hubs refuse a newer database.

## Layout

- `src/main.ts` entry; `src/cli/` the hand-parsed `dude-hub` CLI (`run`, `setup-token`, `owner reset`, `tls`, `self-test`; the service, network, doctor and purge commands live in `src/service/`).
- `src/server/` Fastify app (`create-server.ts`), `routes/` (hello, bootstrap, auth, sessions, devices, device-auth, device-recovery, tls-audit), static/SPA hosting (never rewrites `/api/*`), error mapping, pin handling. Route specs and the `api-client-parity.spec.ts` live beside it.
- `src/security/` headers and CSP, Host guard, request (Origin, Fetch-Metadata, CSRF) guard, cookies, rate limit, persisted throttle, audit log and the single-use ConfirmationStore.
- `src/auth/` owner password (Argon2id), recovery codes, setup token, cookie and bearer sessions, device-token resolution, the `requireOwner` resolver, hub events.
- `src/devices/` pairing codes, Ed25519 keys, device tokens, the registry.
- `src/realtime/` the authenticated WebSocket at `/api/v1/realtime`.
- `src/tls/` self-signed certificate generation (small DER writer), SPKI pins and dual-pin rotation.
- `src/db/` canonical SQLite open and numbered migrations (`0001-initial`, `0002-owner-reset`) and the atomic commit repository.
- `src/admin/` the local admin named pipe or Unix socket and its client, so CLI commands never open `dude.db` while the service runs.
- `src/service/` WinSW wrapper XML, install/lifecycle, LAN mode and firewall rule, `doctor` and `purge`.
- `src/config/`, `src/util/`, `src/testing/` data-directory layout and strict config, ids, the crash-writer fixture.
- Build and packaging scripts are in the repository root `scripts/` (`build-hub.mjs`, `build-hub-sea.mjs`, `stage-hub.mjs`, `build-hub-installer.mjs`, `check-hub-service.mjs`). Specs run with `npm run test:hub`.

## Adding or changing a route

1. Add TypeBox schemas to `@dude/contracts/hub` and register the route with them; declare its credential type and audit event (the audit event list is closed; add to it deliberately).
2. Add the matching method to `@dude/api-client`; `api-client-parity.spec.ts` must pass.
3. Mutating routes get Origin/Fetch-Metadata/CSRF handling by credential type; destructive or authority-changing routes use the ConfirmationStore and need a confirmation-boundary spec registered in the high-consequence gate.
4. Sync routes (Phase 31D) live in `src/server/routes/sync.ts`. They use device credentials (the owner session only for `summary` and the environment clear), enforce `SYNC_POLICIES` and the setting-key scope check on every operation, and never put payloads in audit events. The environment clear uses the ConfirmationStore and needs a confirmation-boundary spec. Still no other public record endpoint or import path.

## Scope ceilings (through 31D)

No Yjs or collaborative editing (31J), no public record endpoints beyond the 31D sync routes, no authenticated shared-state Hub web or Hub web caching (31E), no trusted-CA/reverse-proxy/public mode (31E/31F), no backup (31G).
