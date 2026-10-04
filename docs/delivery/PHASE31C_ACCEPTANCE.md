# Phase 31C implementation and acceptance evidence

Phase 31C (Milestones 628–648, plus fix commits) delivers the self-hosted DUDE Hub, owner identity, the device registry, the canonical SQLite skeleton, the Hub-served administration web and the resident Device Agent. It does **not** synchronize anything: replay, revisions on client records, conflicts and cursors are Phase 31D. Decisions are PD-023 to PD-037 in the [decision log](../history/DECISION_LOG.md#phase-31c-implementation-decisions); the milestone map and deviations are in [Delivery History](../history/DELIVERY_HISTORY.md#phase-31c).

## Implemented scope

- **Hub service (`apps/hub`)**: Fastify over HTTPS only, REST under `/api/v1` with TypeBox schemas on `@dude/contracts/hub`, a self-signed ECDSA P-256 identity built with `node:crypto` and a small DER writer, SPKI pinning by every client, loopback bind by default with explicit LAN and container modes, and a hand-parsed CLI (`run`, `status`, `setup-token`, `owner reset`, `tls status|rotate|activate`, `network lan`, `service …`, `doctor`, `purge`, `self-test`, `version`).
- **Canonical persistence**: `data/dude.db` in WAL with `synchronous=FULL`, opened through the shared Node-only `@dude/sqlite-store` (checksummed, resumable migrations; pre-migration copies in `data/pre-migration/`; `minReaderVersion` refuses downgrade). Migrations 0001–0002 hold the identity tables and the canonical skeleton (`records`, `change_feed`, `applied_ops`) written by an atomic commit repository. The Hub is the only writer; CLI commands go through a local admin named pipe or Unix socket.
- **Owner identity**: one-time setup token (ACL'd file, optional hand-off to a user profile), Argon2id password (`crypto.argon2`), ten single-use recovery codes, `__Host-` cookie sessions with HMAC-derived CSRF, device-bound `dob_` bearer sessions for the Agent, two-step revoke-all and recovery-code regeneration, password change, recovery by code, elevated local owner reset, and device-assisted recovery from a recovery-trusted desktop after Windows Hello or a CredUI current-user check.
- **Device registry**: owner-minted ten-minute pairing codes delivered as `dude-pair:v1:<host>:<port>:<code>:<spki>` with QR, Ed25519 proof-of-possession enrollment, challenge-signed `ddt_` device tokens, list/rename/two-step revoke/unenroll, recovery trust behind a password re-check, and presence.
- **Realtime foundation**: `/api/v1/realtime` authenticated before upgrade, version-negotiated hello, heartbeats, size/rate limits, registry and revocation events, dual-pin TLS rotation announcements.
- **Security baseline from the first endpoint**: security headers, strict API CSP and a hashed-inline-script web CSP, Host allowlist, credential-typed Origin/Fetch-Metadata/CSRF checks, JSON-only bodies and limits, `/api` rate limits, persisted throttling, a closed audit vocabulary with credential-rejecting details (365 days / 100,000 rows) and a server-side confirmation store for destructive actions.
- **Packaging and lifecycle**: `dude-hub.exe` as a Node 24 single-executable application, a sha256-pinned WinSW 2.12.0 service running as `NT SERVICE\DudeHub` over an ACL'd `%ProgramData%\DUDE\Hub`, a non-root Docker image, `DUDE-Hub-Setup.exe` with its own uninstall entry (data kept unless a doubly confirmed purge), and an optional default-off Hub page in the desktop installer. The appx/MSIX target is dropped.
- **Resident Device Agent**: `dude-agent.exe` serves the desktop over an authenticated named pipe (`@dude/agent-pipe`), survives the window, starts at sign-in (per-user ONLOGON task or the HKCU Run key), owns its MachineGuid read and DPAPI-wrapped Ed25519 device key, enrolls, refreshes device tokens, keeps the realtime connection, follows TLS rotation, detects revocation and holds the owner bearer in memory only.
- **Clients**: `@dude/api-client` with typed methods for every route, checked against the Hub's registered routes by a parity spec; sender-checked, validated, credential-scrubbing `dude:hub:*` IPC; the `hub-web` host kind and `production,hub` build; Settings › Environment & Hub, Devices and Security & Sessions; `/hub/setup`, `/hub/sign-in` and `/hub/recover` (shell exception #12); the desktop local-Hub setup wizard and Update Hub prompt.

## Verification results

Final sweep on 2026-10-02 (Windows 11, Node 24.21, npm 11.19) at `0e0ed45f` plus the e2e-config fix `893ae10f`; documentation changes since do not affect these results.

| Check | Result |
|---|---|
| Portable packages (`npm run test:packages`) | 673 files, 4,445 tests pass |
| Angular (`npm test`) | 752 files, 8,065 tests pass |
| Electron and Device Agent (`npm run test:electron`) | 99 files, 896 tests pass, 1 skipped (non-Windows DPAPI path) |
| Hub (`npm run test:hub`, foreground integration suite against real HTTPS listeners and a compiled bundle) | 26 files, 219 tests pass, 2 skipped (`DUDE_TEST_SEA` SEA spec; one contract case replaced by an equivalent spec) |
| Lint and design (`npm run lint`) | ESLint, package boundaries, design tokens, generated theme and 49,008 contrast checks across 144 combinations pass |
| Portable consumption (`npm run check:portable`) | Independent builds and 1,276 ESM export modules import without Angular, Electron, the Hub or Node-only packages |
| Host type checks, inventory, generators, Dockerfiles, boundaries, production audit | `check:hosts`, `check:inventory`, `check:generated`, `check:dockerfiles`, `check:boundaries`, `audit:prod` pass |
| High-consequence gate (`npm run test:high-consequence`) | Portable suite, 50 application files and every core confirmation-boundary spec pass, now including Environment & Hub, Devices, Security & Sessions, the local-Hub panel, store reset and the Hub's sessions, devices and purge boundaries |
| Hub-served web (`npm run test:e2e:hub`) | 16 Playwright tests pass in about 1 minute, including 3 expected failures that record the sandboxed-playground CSP gap below |
| Pages web (`npm run test:e2e`) | 137 Playwright tests pass |
| Production desktop (`npm run check:desktop` after `ng build --configuration production,electron` and `electron:compile`) | Cold and warm launches, preload isolation, deep links, file open, the native helper and isolated saved state pass with the Agent running over the pipe |

The batched gates during implementation (after Milestones 631, 635, 640, 643 and 646) found and fixed: a full-suite `window.dude` isolation flake, a cold dynamic-import timeout, missing Dockerfile manifests for a new workspace, and collapsed backslashes in string literals (a sweep of every Phase 31C string literal found one remaining fixture). One full Angular run failed with an `EnvironmentTeardownError` in the Home layout specs and passed on rerun; one Electron run timed out in `store-validation.spec.ts` and passed alone. Both are recorded as flakes, not fixed.

## Exit-gate evidence

| Exit-gate item | Evidence |
|---|---|
| A user-owned private Hub starts independently of Electron | `dude-hub run` and `dude-hub.exe` start with no Electron binary present: `apps/hub/src/server/cli.spec.ts` spawns the compiled bundle and `apps/hub/src/cli/sea.spec.ts` (`DUDE_TEST_SEA=1`) the SEA; the Docker image and the `hub-service.yml` Windows workflow (`npm run check:hub-service`) assert the service runs while no `electron.exe`/`DUDE.exe` exists. Default exposure is loopback; LAN needs the installer or an elevated CLI |
| Owner bootstrap | `bootstrap.spec.ts`: the setup token gates bootstrap, failures are throttled and audited without the token, success creates the environment, owner and ten codes once; `e2e/hub` proves the browser flow from a stripped fragment token; `bootstrap-local.spec.ts` proves the desktop hand-off path against a real Hub |
| Owner recovery | `auth-routes.spec.ts` and `owner-reset.spec.ts` (recovery code, elevated reset through the admin channel), `device-recovery.spec.ts` (trusted-device challenge signature; untrusted, revoked, replayed and throttled cases), `hub-bridge.spec.ts`/`user-consent.spec.ts` (no agent call without Windows verification), and the e2e recovery step |
| Device registration | `devices.spec.ts` and `devices.confirmation-boundary.spec.ts` (pairing, proof of possession, tokens, rename, revoke, re-enroll only with a new key), `hub-integration.spec.ts` (two real Agent stores enroll, one is revoked, TLS rotation is followed, unenroll), and the e2e simulated device |
| Owns SQLite WAL through APIs | `open-hub-db.spec.ts` (WAL, `synchronous=FULL`, STRICT tables, refused downgrade, pre-migration copies), `canonical-repository.spec.ts` (atomic record + change feed + applied op, duplicate op ids, rollback, hard-kill durability), the admin-channel design that keeps CLI commands out of the database, and the parity spec that every client call is a registered route |
| Remains running with the UI closed | The Hub is a Windows service, container or foreground process with no dependency on the desktop (`check:hub-service` restarts, updates N-1→N and reinstalls with data preserved). The Device Agent outlives the window: `agent.standalone.spec.ts` opens the store with no desktop, `quit-coordinator.spec.ts` detaches instead of stopping, and `hub-integration.spec.ts` keeps the realtime connection with no desktop attached |

## Measurements

`npm run measure:hub` (N=5, win32-x64, Node 24.21, a loaded development machine; written to `dist/measurements/hub.json`):

| Case | Median | p95 |
|---|---|---|
| Hub cold start (bundle; migrations, TLS keygen, self-test) | 266 ms | 272 ms |
| Hub warm start (bundle) | 223 ms | 231 ms |
| Hub cold start (`dude-hub.exe`) | 262 ms | 706 ms (one outlier) |
| `GET /api/v1/hello`, keep-alive | 0.33 ms | 0.98 ms |
| `GET /api/v1/hello`, new TLS connection | 1.89 ms | 2.43 ms |
| Agent spawn to first handshake | 300–341 ms | 388–560 ms |
| Agent connect + handshake (running agent) | 0.83 ms | 0.95 ms |
| `store.hydrate`, 1,000 key/value entries | 5.7 ms | 6.4 ms |

Migration time alone is not separable from the bundle; cold minus warm (about 44 ms) bounds migrations, key generation and the self-test. No earlier baseline exists, so no regression claim is made.

## Limitations and known gaps

- **Sandboxed playgrounds in Hub web**: Python Playground, JS Playground, HTML Preview (and likely Template Renderer) render `srcdoc` iframes that inherit the page CSP, so their inline bootstraps are blocked on the Hub origin. The CSP is not loosened with `'unsafe-inline'`; serving sandbox documents from a Hub route with their own CSP belongs to 31E ("runs browser-safe tools locally"). The standalone Pages build and desktop are unaffected. *Resolved in Phase 31E (Milestone 666):* every host now loads static `sandbox/*.html` pages by `src`.
- **Hub web scope**: owner administration only. Browsers see a certificate warning (self-signed; trusted CA and reverse-proxy modes are 31E/31F), there is no service worker or offline mode (31E), and exposure (loopback/LAN) is shown as the elevated commands rather than read from the API. *Resolved in Phase 31E:* Hub web is the shared-state app with a public-asset service worker, a built-in local CA removes the warning once the root is installed, and Settings › Endpoint & Exposure reads the diagnostics report; see [31E acceptance](PHASE31E_ACCEPTANCE.md).
- **No synchronization**: `records`/`change_feed`/`applied_ops` have no public endpoints; device records keep their standalone environment id until the 31D import/merge.
- **Unverified in automation**: the Docker images were never built locally (no daemon); the `docker-smoke`, `hub-service` and `hub-e2e` CI jobs and `test:hub` in CI run for the first time after this phase. Real UAC prompts (local setup, Update Hub), real Windows Hello/CredUI, the NSIS pages, agent stop/autostart cleanup and both installers were not executed.
- **Update Hub** is offered only on per-machine installs; a per-user install must run `DUDE-Hub-Setup.exe` itself.
- Renaming a device on the desktop does not propagate to the Hub's registry; the owner renames it in Devices.
- The credential-endpoint rate limit (burst 10, 20/min per IP) is tight for rapid scripted flows; the Hub integration spec waits for it.
- The WinSW binary hash is trust-on-first-download from the official release; all executables remain unsigned (SmartScreen and Smart App Control behaviour is documented in [Windows setup](../WINDOWS_SETUP.md)).

## Owed manual verification

On an installed build (NSIS) on Windows 11:

1. Desktop installer with "Also install the DUDE Hub": service running as `NT SERVICE\DudeHub`, data ACLs, Apps & Features entries for both products.
2. Settings › Environment & Hub local setup wizard: UAC prompt, owner creation, recovery codes, self-enrollment and owner sign-in.
3. A second physical desktop over LAN (`dude-hub network lan on`): pairing string, enrollment, presence, revoke.
4. Windows Hello (and CredUI fallback) device-assisted recovery from a recovery-trusted desktop.
5. Update Hub from a per-machine install (N-1 → N) with data preserved; Hub uninstall keeps data; purge path.
6. Resident agent across sign-out/sign-in (task or Run key), quit-detach, stop/start, version-skew restart after a desktop update, and Smart App Control behaviour with unsigned executables.
7. The owed Phase 31B installed-build pass ([31B acceptance](PHASE31B_ACCEPTANCE.md#owed-manual-verification)).

## Reproduction

`npm ci`, then the commands in the verification table. Hub-specific: `npm run hub:compile`, `npm run hub:sea`, `npm run hub:stage`, `npm run hub:installer`, `npm run build:hub-web`, `npm run test:hub`, `npm run test:e2e:hub`, `npm run measure:hub`, and (elevated Windows) `npm run check:hub-service -- --require`.
