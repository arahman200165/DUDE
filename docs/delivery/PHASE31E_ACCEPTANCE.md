# Phase 31E implementation and acceptance evidence

Phase 31E (Milestones 663–682, plus fix commits) delivers the Hub-served authenticated Angular web with shared state and private-mode access: pin-only device TLS verification, configured Hub names, a built-in local CA (default for new Hubs), certificate import and reverse-proxy mode with proxy pins, sandboxed tools that load static pages on every host, Hub web CSP relaxations without `'unsafe-eval'`, a service worker that caches public assets only, browser device rows and cookie-only web record routes, in-browser three-way merge with realtime, the Hub web Sync UI with a sign-out wipe, an endpoint diagnostics engine with Settings › Endpoint & Exposure, per-principal rate limits and packaging that always ships the web UI. Public (Internet) mode can be configured but the Hub refuses to run it; it is released by 31F. Decisions are PD-050 to PD-062 in the [decision log](../history/DECISION_LOG.md#phase-31e-implementation-decisions), with amendments recorded under PD-050, PD-053, PD-055, PD-056, PD-058, PD-060 and PD-061; the milestone map and gotchas are in [Delivery History](../history/DELIVERY_HISTORY.md#phase-31e). The contracts are the "As built in Phase 31E" sections of [System](../architecture/SYSTEM_ARCHITECTURE.md#as-built-in-phase-31e-hub-served-web), [Security](../architecture/SECURITY_ARCHITECTURE.md#as-built-in-phase-31e-trust-and-exposure) and [Data and sync](../architecture/DATA_SYNC_ARCHITECTURE.md#as-built-in-phase-31e-hub-web-shared-state).

## Implemented scope

- **Hub**: self-signed leaves without `keyUsage`; a strictly validated `exposure` config block (mode, names, canonical origin) feeding the Host allowlist, the Origin check and the certificate SANs; `tls names list|add|remove`; the built-in name-constrained local CA (`tls ca init|status|export`, DPAPI LocalMachine-protected CA key, an isolated renewal job that re-certifies the same leaf key 30 days before expiry); `tls import`; `tls proxy-pin add|activate|remove|list`; reverse-proxy mode (`network proxy on --trusted --public-origin`) and the gated `network mode public`; HSTS only with a browser-trustable certificate; a per-address flood guard plus per-session and per-device rate buckets; per-page CSP and `frame-ancestors 'self'` on `/sandbox/*` (also on 304 responses); static serving with br/gzip negotiation, ETag/304, HEAD and streaming; the diagnostics engine (13 readiness checks, `doctor [--json]`, `GET /api/v1/diagnostics`); migration 0004 (`tls_pins.source`, proxy pins) and 0005 (browser device rows, `sessions.browser_device_id`, `web_access`); the cookie-only `/api/v1/web` routes (attach, snapshot, changes, push, state, access); `changes-available` and `web-access-changed` to owner sockets; typed `@dude/api-client` methods.
- **Agent and desktop**: `connectPinned` (chain verification off, SPKI pin checked on `secureConnect`, so no byte reaches an unpinned peer); device-store migration 0004 (advertised proxy pins) and `proxySpkiSha256` in hello; the `hub.diagnostics` RPC and the Settings › Endpoint & Exposure "This device" panel; "Open Hub web in browser" and, for a local-CA Hub, "Install root certificate" (`certutil -user` behind a single-use token from a preview).
- **Web**: sandboxed tools (JS and Python Playground, Template Renderer, HTML Preview, Markdown Workspace plugins) load static `sandbox/<kind>.html` pages by `src` with the one-shot `dude-sandbox-ready` / `dude-sandbox-load` / `dude-sandbox-loaded` handshake on every host; JSON Schema Validator moved from ajv to `@cfworker/json-schema` (error wording changed on every host), CBOR decodes with `cbor-x/decode-no-eval`, Protobuf Decoder has a reflection fallback under a CSP; the hub build's service worker (`ngsw-config.hub.json`, no `dataGroups`, navigation excludes `/api` and `/sandbox`); Hub web boot (attach and snapshot before bootstrap), a Hub kv backend and entity collections, browser three-way merge with a Keep Hub / Keep mine / Keep both dialog, online-only shared writes, the realtime client, the browser `SyncPort` (shell indicator and Settings › Sync with environment-level web-access toggles and a per-device table), the sign-out wipe, read-only boot when the Hub is unreachable, Settings › Endpoint & Exposure with a "This browser" panel, and private Hub share links with a public Pages companion link (`index.hub.html`).
- **Packaging and CI**: the Docker image is multi-stage and builds the Hub web; `hub:stage` and `hub:sea` build it on demand or fail (`DUDE_SKIP_HUB_WEB=1` opts out); the CI `docker-smoke` job asserts that `/` serves the app (brotli) and the API stays JSON; the trusted Hub e2e (`npm run test:e2e:hub`) no longer ignores certificate errors.

## Verification results

Gates were run as batches during implementation (after Milestones 666, 673–674, 677 and 681) and were green: `npm run lint`, `npm run test:packages` (4,513), `ng test` (8,235), `npm run test:hub` (420, 2 skipped), `npm run test:sync` (11), `npm run test:e2e:hub` (368: 10-hub-flow 6, 20-csp-sweep 11, 30-shared-state 9, 40-routes-sweep 342), `npm run test:e2e:sync` (5; the unpackaged Electron-as-Node Agent enrolls over the pinned path) and the Pages `npm run test:e2e` (137). Two `EnvironmentTeardownError` suite flakes under full `ng test` load passed on rerun, and the 10-hub-flow step e final sign-in timed out once. `npm test` stops at the package stage when that stage fails, so a green run must be checked for `ng test` having actually run. Fix commits are recorded in [Delivery History](../history/DELIVERY_HISTORY.md#phase-31e): `3a92fc2c` (sync summary schema spec), `893aa005` (full-page sign-in and sign-out in the e2e flow) and `5279b9d8` (a 5xx counts as unreachable, realtime recovery after an HTTP-only failure, `cbor-x` decode-no-eval, and the Pages offline-map orphan chunk that had broken the Pages postbuild since Milestone 679). The Docker multi-stage build was not run locally (no daemon); its first run is CI.

## Exit-gate evidence

| Exit-gate clause | Evidence |
|---|---|
| Authenticated Hub web serves shared state | `e2e/hub/30-shared-state.spec.ts` (browser attach and Devices row; favorites, settings and a pipeline in both directions between the browser and a simulated desktop over the realtime nudge; a real merge3 conflict with Keep Hub / Keep mine / Keep both; web-access toggles; Hub unreachable; session expiry; sign-out wipe); `apps/hub/src/server/routes/web-records.spec.ts` (browser rows, category filtering, cookie-only access); `e2e/hub/10-hub-flow.spec.ts` (setup, sign-in, pairing, sign-out); the Hub web specs under `apps/web/src/app/core/hub-web/` (boot, kv backend, entity store, realtime client, retry, sync adapter) |
| Runs browser-safe tools locally | `e2e/hub/40-routes-sweep.spec.ts` (every tool route, hard navigation and reload, no CSP violations or console errors); `e2e/hub/20-csp-sweep.spec.ts` (Python Playground, JS Playground, HTML Preview and JSON Schema Validator under the Hub CSP, including re-created HTML Preview frames); `apps/hub/src/security/security.spec.ts` (page CSP never contains `'unsafe-eval'`) |
| Recovers direct routes | `e2e/hub/40-routes-sweep.spec.ts` (hard-navigates and reloads every tool and workbench route; API 404s stay JSON; sandbox frame headers); `apps/hub/src/server/static.spec.ts` (SPA fallback never rewrites `/api/*`, ETag/304, HEAD, compression); the CI `docker-smoke` assertion that `/` serves the app (first run pending) |
| Preserves standalone Pages/PWA behavior | the Pages `npm run test:e2e` suite (137 passed, including `e2e/sandbox-isolation.spec.ts`, `pwa-offline.spec.ts`, `web-companion.spec.ts` and the production direct-route specs); the Pages build output is unchanged and the api-client stays out of the Pages bundle; the offline-map generator fix in `5279b9d8` |
| Internet mode is not released until 31F passes | `apps/hub/src/config/config.spec.ts`, `apps/hub/src/config/proxy-config.spec.ts` and `apps/hub/src/service/network-exposure.spec.ts` (`network mode public` needs `--i-understand-unreleased`, and the Hub does not start in public mode unless `DUDE_HUB_UNRELEASED_PUBLIC=1`); `apps/hub/src/diagnostics/engine.spec.ts` (external reachability reported not-checked); Settings › Endpoint & Exposure shows public as not released until 31F |
| Private-mode TLS | `apps/hub/src/tls/local-ca.spec.ts` (name constraints verified with a real OpenSSL handshake; the CA key import boundary), `names.spec.ts`, `import.spec.ts`, `self-signed.spec.ts`, `proxy-pins.confirmation-boundary.spec.ts`; `apps/device-agent/src/hub/pinned-transport.spec.ts` (zero application bytes on a pin mismatch); `e2e/sync/10-two-desktops.spec.ts` (an Electron-as-Node Agent enrolls over the pinned path) |
| Rate limits and trusted proxy | `apps/hub/src/security/rate-limit.spec.ts`, `apps/hub/src/server/proxy.spec.ts` (one trusted hop, effective host and origin, HSTS follows the certificate source) |
| Destructive actions | `npm run test:high-consequence` with the proxy-pin confirmation-boundary spec and the desktop and renderer "Install root certificate" confirmation-boundary specs (single-use token from the preview) |

## Measurements

`npm run measure:hub-web` (Ryzen 9 5900X, Windows 10.0.26200, Node 24.21, headless Chromium against a compiled Hub serving the precompressed `dist/hub-web/browser`; medians unless stated). The figures are a development-machine record, not hardware-independent guarantees; a first run of the script on the same machine measured realtime at a 26 ms median and the empty boot at 286 ms, so expect run-to-run variance.

| Case | Result |
|---|---|
| Initial JS / CSS (raw, brotli) | `main` 216.0 KiB, 59.2 KiB brotli; styles 82.5 KiB, 11.2 KiB brotli |
| All JavaScript | 1,299 files (1,243 lazy chunks), 21.3 MB raw, 4.9 MB brotli |
| Service worker `app` prefetch group | 7 files, 429.1 KiB raw, 99.1 KiB brotli |
| Cold load (fresh context, signed in) | usable 257 ms, live 272 ms, DOMContentLoaded 123 ms, about 400 KB transferred |
| Warm load (service worker controlling) | usable 114 ms, live 120 ms, DOMContentLoaded 28 ms, 0 bytes transferred |
| Boot to live with 0 / 500 / 2,000 Hub favorites | 873 ms / 281 ms / 337 ms (the first fresh context after the realtime step ran slow; the earlier run measured 286 / 286 / 326 ms) |
| Realtime: device push to visible change | median 151 ms, p95 1,131 ms over 10 pushes |
| `GET /` and `GET /main-*.js` (Node, brotli) | 2.98 ms and 3.21 ms; 304 revalidation 3.03 ms and 3.14 ms; `main` transfers 60,614 bytes |

The Hub web service worker prefetch is 423.8 kB against the 800 kB budget (`ngsw-config.hub.json`, checked by the cache budget script after `build:hub-web`).

## Distributed release verification matrix

| Row | Evidence |
|---|---|
| Web: deep links and refresh | `e2e/hub/40-routes-sweep.spec.ts`, `e2e/hub/10-hub-flow.spec.ts`; the Pages production direct-route specs remain in `npm run test:e2e` |
| Web: API versus SPA routing | `static.spec.ts` (SPA fallback never rewrites `/api/*`), the routes sweep (API 404s stay JSON), CI `docker-smoke` (first run pending) |
| Web: standalone companion regression | the Pages `npm run test:e2e` (137 passed) and the unchanged Pages sandbox-isolation suite |
| Web: private-cache isolation | `ngsw-config.hub.json` has no `dataGroups` and its navigation excludes `/api` and `/sandbox`; `30-shared-state` step i (sign-out wipes storage and IndexedDB and keeps only the public service worker caches) |
| Web: CSRF and origin controls | `apps/hub/src/security/security.spec.ts` and `web-records.spec.ts` (cookie-only, CSRF on mutating routes; bearer and device credentials get 401 on web routes) |
| Web: authenticated WebSocket | the realtime specs and `30-shared-state` (owner sockets receive `changes-available` and `web-access-changed`; a session that ends locks the page to sign-in) |
| Multi-device (browser part) | `30-shared-state` (a browser and a simulated desktop converge in both directions); the two-machine LAN pass is owed |
| Identity (TLS part) | pin-only verification and the pinned-path e2e; sync-time revoked-device verification for Internet exposure remains 31F |

The Internet mode row (TLS and readiness checks, rate limiting, diagnostics) is only partly touched: private-mode TLS, rate limits and diagnostics are verified here; external reachability, ACME, DNS and dynamic-address support and the rest of the row remain 31F.

## Known limitations and owed manual passes

- **Public mode is not released.** It can be configured; the Hub refuses to run it until 31F, which also owns external reachability verification, ACME/DNS/dynamic address, sync-time revoked-device verification for Internet exposure and the review of the `DUDE_HUB_TEST_*` knobs.
- **Browser rows accumulate per sign-out.** Sign-out wipes the installation id, so each sign-in after a sign-out creates a new browser row; older rows are pruned after 90 days and the owner can remove them in Devices.
- **Hub web shared writes are online-only** with no browser outbox; with the Hub unreachable at boot the page starts read-only for shared state.
- **Two-machine LAN browser pass** owed: a second PC or phone browser and a desktop against the Hub over the LAN.
- **Local-CA root on a second PC and in Firefox** (Firefox has its own trust store) owed.
- **A real reverse proxy** (Caddy) end to end with `network proxy on`, a proxy pin and the public origin owed; proxy mode is covered by specs only.
- **First CI runs** of `docker-smoke` with the multi-stage image and of the new e2e suites (`test:e2e:hub` with the trusted-certificate setup) are pending.
- **Elevated service run** of `tls ca init`, `tls import`, `network proxy` and `network mode` against the installed Windows service owed (the specs use the admin pipe and a foreground Hub).
- **Real `certutil` install** from the desktop ("Install root certificate") and the Windows security prompt that accompanies a root install owed.
- `tls ca init` requires a running Hub; in proxy mode the public host is not added to the Hub's own certificate; the local-CA leaf skips IP SANs outside the name constraints (a DNS name outside them is an error).
- Any 5xx (including the service worker's 504) reads as Hub unreachable; the service worker registers only once the browser trusts the certificate.

The still-owed 31B, 31C and [31D](PHASE31D_ACCEPTANCE.md#owed-manual-verification) passes remain owed.

## Reproduction

`npm ci`, then `npm run test:hub`, `npm run test:sync`, `npm run test:e2e:hub` (local; builds the Hub bundle and the hub web configuration first), `npm run test:e2e:sync` (local Windows), `npm run measure:hub-web`, `npm run test:e2e` (Pages) and `npm run test:high-consequence`.
