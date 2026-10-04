# AGENTS.md — apps/hub/

The self-hosted **DUDE Hub** (Phases 31C-31E, complete; 31D added synchronization and 31E the Hub-served shared-state web, trusted certificates and private-mode access): the user's own authoritative service for owner identity, the device registry, sessions, audit and a canonical SQLite skeleton. It runs independently of Electron, as a Windows service, a Docker container or a foreground process. DUDE never operates an instance. Decisions: PD-023 to PD-037 in the [decision log](../../docs/history/DECISION_LOG.md#phase-31c-implementation-decisions) (amended for PD-025 and PD-026); PD-038 to PD-049 (31D) and PD-050 to PD-062 (31E) in the same log. Evidence: [Phase 31C acceptance](../../docs/delivery/PHASE31C_ACCEPTANCE.md), [31D](../../docs/delivery/PHASE31D_ACCEPTANCE.md) and [31E](../../docs/delivery/PHASE31E_ACCEPTANCE.md).

## The rules

- Plain TypeScript with its own `tsconfig.json`, compiled by `esbuild` to a CJS bundle and packaged as a Node 24 single-executable application. Never pulled into `tsconfig.app.json`.
- Never import `electron`, `@angular/*`, `apps/web`, `@dude/device-agent` or `@dude/desktop`. Shared code comes only from portable packages, plus the Node-only `@dude/sqlite-store`.
- `src/security/ip-block.ts` blocks an address (not loopback) after 25 failed credentials across kinds or 10 flood rejections in 15 minutes (15 min, 1 h, 6 h, 24 h by strike, forgotten after 7 days). It persists in `ip_blocks` (migration 0006), is audited (`security.ip-blocked`, `security.ip-unblocked`) and is cleared only by the elevated `dude-hub security blocks list|clear <address>` (admin methods `security.blocks.*`).
- `src/cli/test-overrides.ts` reads TEST-ONLY env knobs in `run` (`DUDE_HUB_TEST_RELAX_RATE_LIMITS=1`, `DUDE_HUB_TEST_SYNC_RETENTION_DAYS`, `DUDE_HUB_TEST_SYNC_COMPACTION_MS`) for the two-Agent sync suite; never a CLI flag or config field. They are honoured only by the test bundle (`npm run hub:compile:test` -> `dist/hub-test/`, `__DUDE_HUB_TEST_BUILD__`); the release bundle (`hub:compile`, SEA, service, Docker) ignores them and public mode refuses to start if one is set (PD-068). Test harnesses (`hub-harness.ts`, `e2e/hub`, `measure-hub-web`) use the test bundle.
- The Hub process is the only writer of `data/dude.db`. CLI commands that need state go through the local admin named pipe while the service runs; they never open the database.
- Every route has a TypeBox schema (request and response), declares its credential type (none, setup token, owner cookie session, owner bearer session, device token), and writes an audit event. A device credential alone never grants owner rights.
- HTTPS only. No listener on a non-loopback address unless LAN mode is on (installer checkbox or elevated `dude-hub network lan on|off`) or container mode is set. Reverse-proxy mode listens on loopback only.
- Public (Internet) mode is configurable but refused: `network mode public` needs `--i-understand-unreleased` and the Hub will not start in public mode without `DUDE_HUB_UNRELEASED_PUBLIC=1`, until Phase 31F releases it. Exposure changes (names, CA, import, proxy, mode) are elevated admin-pipe commands; no owner-session route may widen exposure.
- The built-in local CA key is DPAPI LocalMachine protected and may be unprotected only by the admin methods, the leaf issuer and the isolated renewal job; a spec in `src/tls/local-ca.spec.ts` enforces the import boundary. Request handlers never touch it.
- Every certificate change (re-issue, renewal, import, proxy pin) goes through the dual-pin stage and activate rotation. Self-signed leaves omit `keyUsage` (BoringSSL).
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
- `src/tls/` self-signed and local-CA certificate generation (small DER writer, `local-ca`, `leaf-issuer`, `renewal`, `ca-key-protector`), configured names, certificate import, proxy pins, SPKI pins and dual-pin rotation.
- `src/diagnostics/` the one endpoint diagnostics engine (readiness checks marked verified, claimed or not-checked) behind `GET /api/v1/diagnostics`, the admin `diagnostics` method and `dude-hub doctor`.
- `src/db/` canonical SQLite open and numbered migrations (`0001-initial` to `0005-web-browsers`) and the atomic commit repository.
- `src/admin/` the local admin named pipe or Unix socket and its client, so CLI commands never open `dude.db` while the service runs.
- `src/service/` WinSW wrapper XML, install/lifecycle, LAN mode and firewall rule, `doctor` and `purge`.
- `src/config/`, `src/util/`, `src/testing/` data-directory layout and strict config, ids, the crash-writer fixture.
- Build and packaging scripts are in the repository root `scripts/` (`build-hub.mjs`, `build-hub-sea.mjs`, `stage-hub.mjs`, `build-hub-installer.mjs`, `check-hub-service.mjs`). Specs run with `npm run test:hub`.

## Adding or changing a route

1. Add TypeBox schemas to `@dude/contracts/hub` and register the route with them; declare its credential type and audit event (the audit event list is closed; add to it deliberately).
2. Add the matching method to `@dude/api-client`; `api-client-parity.spec.ts` must pass.
3. Mutating routes get Origin/Fetch-Metadata/CSRF handling by credential type; destructive or authority-changing routes use the ConfirmationStore and need a confirmation-boundary spec registered in the high-consequence gate.
4. Sync routes (Phase 31D) live in `src/server/routes/sync.ts`. They use device credentials (the owner session only for `summary` and the environment clear), enforce `SYNC_POLICIES` and the setting-key scope check on every operation, and never put payloads in audit events. The environment clear uses the ConfirmationStore and needs a confirmation-boundary spec. Still no other public record endpoint or import path.

5. Web routes (Phase 31E) live in `src/server/routes/web-records.ts` under `/api/v1/web` (attach, snapshot, changes, push, state, access). They are cookie-session only (bearer and device credentials get 401), carry CSRF and Origin checks, reuse the sync contracts and `commitCanonical` with the browser device row as the acting device, enforce per-category web access, and never put payloads in audit events. A browser row is attribution, never a credential: it must not be able to obtain a device token, enroll, be recovery-trusted or block pin rotation.
6. Static and sandbox serving: `/sandbox/*` pages carry their own CSP and `frame-ancestors 'self'`, and those headers must also be sent on 304 responses (a 304's headers merge into the cached response, so the app's `X-Frame-Options: DENY` would otherwise block the frame). The page CSP never contains `'unsafe-eval'`. Only `/assets/vendor/pyodide/*` is CORS-readable. The static handler never rewrites `/api/*`.

## Scope ceilings (through 31E)

No Yjs or collaborative editing (31J), no public record endpoints beyond the 31D sync routes and the 31E `/api/v1/web` routes, no browser offline outbox or server-side conflict inbox, no Internet (public) mode release, external reachability verification, ACME/DNS/dynamic address or sync-time revoked-device verification for Internet exposure (31F), no backup (31G).
