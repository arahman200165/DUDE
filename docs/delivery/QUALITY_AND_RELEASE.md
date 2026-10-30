# Quality and Release Specification

This specification owns testing and release acceptance for the shipped Windows/static-web product and the planned distributed release. Historical completed V1 checks are evidence in Delivery History, not the DUDE 2.0 checklist.

Read [the master PRD](../DUDE_PRD.md) first. Product direction and invariants live there; this document owns the detailed contracts in its domain.

Related: [DUDE System Architecture](../architecture/SYSTEM_ARCHITECTURE.md) · [DUDE Security Architecture](../architecture/SECURITY_ARCHITECTURE.md) · [DUDE UX Specification](../product/UX_SPEC.md) · [DUDE Roadmap](ROADMAP.md) · [DUDE Delivery History](../history/DELIVERY_HISTORY.md).

## Contents

- [Testing Strategy](#testing-strategy)
- [Performance Gates](#performance-gates)
- [Accessibility Gates](#accessibility-gates)
- [Build and Deployment](#build-and-deployment)
- [Documentation Deliverables](#documentation-deliverables)
- [DUDE 2.0 Distributed Release Definition of Done — All Planned](#dude-20-distributed-release-definition-of-done--all-planned)
- [SaveSphere First Release Definition of Done — All Planned](#savesphere-first-release-definition-of-done--all-planned)
- [Tool Verification](#tool-verification)
- [Versioning and Upgrade Evidence](#versioning-and-upgrade-evidence)

## Testing Strategy

Selected quality posture:

> Protect critical paths with risk-based release gates; the historical V1 posture was “ship first.”

Testing should protect the framework and critical paths, not chase a coverage number.

Phase 31A keeps root commands as wrappers: `npm test` runs portable transform/contract tests and then Angular adapter tests; `npm run test:electron` covers main/preload trust boundaries. `npm run test:high-consequence` includes extracted engine tests and existing application confirmation tests; it is a local pre-release command, and CI does not repeat it because every suite it filters (`test:packages`, `ng test`, `test:electron`, `test:hub`) runs there in full. `check:portable`, `check:boundaries`, `check:hosts` and `check:inventory` verify independent package consumption, host separation, host declarations and source/scope inventories. `check:clean` builds a fresh installation twice and compares every production asset, normalizing only Angular's service-worker timestamp. Windows acceptance uses `check:desktop` after the Electron production build and native helper compilation; its isolated profile, stable fixture origin and picker fixtures do not change OS protocol or login settings. `audit:prod` audits production dependencies and fails on any high or critical advisory outside its documented accepted list; an accepted entry fails again once a fix is published.

**Hub gates (Phase 31C).** `npm run test:hub` builds the Hub bundle and runs the Hub's specs (`vitest.hub.config.mts`), including the `@dude/api-client` parity spec and the confirmation-boundary specs for purge, devices and sessions. A real-process integration spec in `apps/device-agent` (run by `test:electron`) drives a built Hub through enrollment, pairing, revocation, TLS rotation and unenroll, and the Settings and Hub confirmation-boundary specs run in the Angular suite; `test:high-consequence` covers every boundary spec. `npm run check:hosts` also type-checks `apps/hub`. `npm run check:dockerfiles` fails when the Hub or relay Dockerfile does not copy every workspace manifest. The `hub-service` job in `ci.yml` (`npm run check:hub-service`, windows-latest, pushes only) stages the Hub and exercises service install, owner bootstrap, restart, an N-1 to N update, LAN toggling, uninstall and reinstall. The `docker-smoke` job in `ci.yml` builds both images, bootstraps the container and verifies that its volume survives a restart. The `hub-e2e` job runs `npm run test:e2e:hub` (browser end-to-end against a real Hub with its web build: flow, CSP sweep and, from 31E, shared state and the routes sweep). `npm run measure:hub` records Hub startup, memory, database and bundle measurements; they inform budgets and are not hardware-independent guarantees. Results and any owed manual or elevated passes are in [Phase 31C acceptance](PHASE31C_ACCEPTANCE.md).

**Sync gates (Phase 31D).** `npm run test:sync` builds the Hub bundle and runs the eleven exit-gate scenarios (two real Device Agent stores against one real Hub, about 20 seconds); it is part of `test:electron`, and the Hub's sync route and environment-clear confirmation-boundary specs run in `test:hub`. `npm run test:e2e:sync` builds the production Electron renderer and drives two real Electron desktops against a real Hub (five tests, about 60 seconds); it is a local Windows gate and not in CI. `npm run measure:sync` records push throughput, catch-up, conflict handling, record-size boundary and Hub and outbox growth. `test:high-consequence` includes the sync confirmation-boundary specs. Results and the owed two-machine pass are in [Phase 31D acceptance](PHASE31D_ACCEPTANCE.md).

**Hub web gates (Phase 31E).** `npm run test:e2e:hub` now runs four suites against a real Hub with its web build and a trusted certificate (no `ignoreHTTPSErrors`: Chromium trusts exactly the e2e Hub's leaf key through an SPKI list and the Node-side request context trusts the local-CA root through `NODE_EXTRA_CA_CERTS`): `10-hub-flow` (setup, sign-in, pairing, sign-out), `20-csp-sweep` (sandboxed and eval-sensitive tools under the Hub CSP), `30-shared-state` (browser and simulated desktop converge in both directions, a real merge conflict, web-access toggles, Hub unreachable, session expiry and the sign-out wipe) and `40-routes-sweep` (every tool and workbench route hard-navigated and reloaded with no CSP violation or console error; API 404s stay JSON). `npm run measure:hub-web` records the Hub web measurements. The Hub's TLS, proxy, rate-limit, diagnostics and web-route specs run in `test:hub`; the `docker-smoke` job asserts that the multi-stage image serves the app at `/` and the API stays JSON. Results and the owed manual passes (two-machine browser, second PC and Firefox root trust, a real reverse proxy, elevated service runs, first CI runs) are in [Phase 31E acceptance](PHASE31E_ACCEPTANCE.md).

**Backup and transfer gates (Phase 31G).** The format library is covered by `packages/hub-backup/src/backup.spec.ts` (round trip, header and ciphertext tamper, truncation, reorder, wrong-passphrase and size-limit cases) and `check:portable`. The Hub's backup, restore, fence, re-attach, status and confirmation-boundary specs run in `test:hub`, and `test:high-consequence` includes the create, transfer and restore boundary specs. The device authority, reconcile-flag, rebase and reconnect specs run in `test:electron`. `npm run test:e2e:hub` now runs a fifth suite, `50-backup-transfer` (six serial real-process tests: transfer, the 503 fence and web notice, restore onto a second data directory, the old owner password, re-attach and a negative restore matrix, reactivate), and `npm run test:e2e:sync` gains `20-restore-reconnect` (eleven tests: a stale-history restore with two real desktops and pending offline edits, no edit lost, and a transfer scenario). `npm run measure:backup` records the cost of backup, verify and restore on a real release bundle and CLI; the numbers are a development-machine record, not guarantees. Results and the owed passes are in [Phase 31G acceptance](PHASE31G_ACCEPTANCE.md).

**Android gates (Phase 31H).** `check:mobile` verifies mobile declarations and production boundaries; `test:mobile` covers mobile identity/session, portable discovery, durable SQLite contracts, sync and confirmation boundaries. `mobile:android` builds locally with JDK 17 and the Android SDK; `mobile:package` requires preview signing configuration and produces APK, AAB and SHA256 sums. `test:e2e:mobile` runs the installed bundled app through focused Maestro journeys, temporarily enlarging Android font scale and restoring the prior setting. `measure:mobile` records observed activity display startup, memory and available app-private database/outbox counts; catch-up and physical-network measurements must be recorded separately where unavailable. Native instrumentation must run on API 29 and API 36. Existing web, Hub, desktop and portable gates remain required. The protected preview key is separate from disposable emulator acceptance keys. [Phase 31H acceptance](PHASE31H_ACCEPTANCE.md) records which gates actually passed; signing, physical connectivity, native SQLite restart and accessibility evidence must not be inferred from TypeScript mocks or the existence of pipeline code.

**Android tool gates (Phase 31I, complete).** `check:mobile` also enforces the shell, tools and host import regions (a tool engine in the shell entry chunk, a barrel `@dude/crypto` import or a host global fails it), `test:mobile` covers the kit, off-thread runner, preference scope, Recents, background wipe, share model and engine-host ports, and `generate:registry` fails when a binding is stale. `test:e2e:mobile` now runs the shell flows, the Share-to-DUDE flow and one Maestro journey per tool (43 flows) at font scale 1.5; they pass on API 29 and API 36 and are release-blocking in CI for every change that reaches the Android app. CI builds the x86_64 acceptance APKs once (`mobile-build`) and splits each API level's flows across four emulator shards (`mobile-native`, `--shard <i>/4`); shard 1 also runs the `:dude-hub` instrumentation through `scripts/mobile-instrument.mjs --tunnel-edge`, which adds the tunnel-domain (public-CA) acceptance of 32-SS1 Milestone 840 (a throwaway CA in the emulator's user trust store, a stub TLS edge in front of a stub Hub; the release app never trusts a user CA, asserted by `tests/mobile-native-privacy.test.mjs`). Each journey's expected values come from the shared engine's spec vectors or the same engine function, not from the UI. Flows that pass only on a re-run are reported FLAKY and are not hidden. The harness default is one retry (`DUDE_E2E_RETRIES`) and 8 flows per Maestro session (`DUDE_E2E_BATCH`) so an adb drop costs one batch. `measure:mobile -- --tools` runs the flag-gated measurement screen (built with `EXPO_PUBLIC_DUDE_MEASURE=1`; `check:mobile` fails if it is in a normal bundle). Camera scanning, TalkBack and the physical-phone runs are recorded in [Phase 31I acceptance](PHASE31I_ACCEPTANCE.md); the missing-Keystore and corrupt/full-storage cases stay automated-only ([plan deviations](PHASE31I_PLAN.md#deviations-and-implementation-notes)).

**SaveSphere platform gates (Phase 32-SS1, complete at Milestone 855).** The exit gate is automated ([decision PD-154](PHASE32SS_PLAN.md), results in [the SS1 acceptance](PHASE32SS1_ACCEPTANCE.md#automated-exit-gate-evidence) and [the SS1 plan](PHASE32SS1_PLAN.md)); real Cloudflare, Google, Windows-service, second-machine, standby, Android-device and browser behavior is the owner's guided script (S1 to S18, blocking and may-slip marked), owed and not gating 32-SS2. `npm run test:e2e:hub` gains `70-platform` (eight serial real-process tests on its own Hub: provisioning through the real CLI, a resumable chunked upload to a byte-identical blob, a scheduled `blobs.verify` queue job, ingest tokens and the credential matrix, Google sign-in against the fake OpenID provider with wrong `sub`, nonce, `aud` and `exp` refused and Google unreachable falling back to the password, tunnel mode behind the stub `cloudflared` with forged forwarding headers ignored and `www` redirecting, and backup v2 run, verify, restore drill and offline restore; the fake provider and the stub connector are driven by test-bundle-only knobs). `npm run test:hub:s3` runs the S3 destination, a whole backup and a restore against a real S3-compatible server when `DUDE_TEST_S3_ENDPOINT` is set (the `hub-s3` CI job starts MinIO and sets `DUDE_TEST_S3_REQUIRE` so a lost server fails the job; locally: `docker run -d -p 127.0.0.1:19000:9000 -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin-secret -e MINIO_DEFAULT_BUCKETS=dude-test bitnamilegacy/minio:2025.4.22`, then the `DUDE_TEST_S3_*` variables in the spec header); without the endpoint the spec skips. The `backup-scale` CI job runs `npm run test:backup-scale` (the v2 format at 600 MiB with deterministic memory counters) and `npm run test:hub:large` (the Hub engine and restore over about 590 MiB of generated blobs, for a repository backup and a transfer export, each restored and every blob re-hashed, with sampled resident memory under 256 MiB growth; about 2 GiB of temporary disk and a minute or two). `docker-smoke` also runs `node scripts/docker-smoke-platform.mjs`: provision, restart, then storage, the queue, a resumable upload, an ingest token and backup v2 with an offline restore inside the image, and it asserts that vector search, the tunnel and the power policy report "unavailable" there. `hub:stage` now also fetches and stages the pinned `vec0.dll`, and `check:hub-service` (elevated Windows) installs it beside the executable and provisions the installed Hub (content store, FTS5, a worker re-spawned from the executable and a loaded `vec0.dll`).

### Required test targets

#### Unit tests

Focus on:

- tool registry behavior;
- persistence policy handling;
- worker execution wrapper;
- key pure transformation helpers;
- route metadata generation if custom.

#### Smoke / integration tests

At minimum verify:

- application loads;
- deck renders;
- tool can be opened from navigation;
- command/search can find a tool;
- direct tool route resolves;
- 404 fallback recovers intended route;
- offline shell behavior works at a basic level;
- at least one worker-backed tool completes successfully.

#### Post-V1 hardening direction

The original test bar intentionally optimized for shipping. Phase 23 does not erase that history; it raises the bar specifically where DUDE has become high-consequence: published vectors, independent reference cross-checks, property tests, fuzzing, golden corpora, destructive-action tests, sandbox regressions, deterministic fixtures, performance corpora, and capability-specific release gates.

### Historical V1 Deferrals / Later-Roadmap Candidates

The following were deliberately deferred from the original V1 quality bar and remain preserved as such; later phases may adopt them selectively where they create real confidence rather than treating “exhaustive” coverage as a goal by itself:

- E2E tests for every tool;
- exhaustive accessibility automation;
- cross-browser CI matrix;
- visual regression infrastructure;
- performance lab;
- coverage percentage gates.

Phase 30K adopted one narrow slice of the second item: `npm run test:appearance` sweeps every appearance color combination against the production build ([Accessibility](../product/UX_SPEC.md#accessibility)). It is an appearance matrix, not exhaustive accessibility automation of every tool.

### Distributed release verification matrix

| Area | Required evidence before its gate closes |
|---|---|
| Shared core | Existing golden fixtures and consequence-specific tests remain green; extracted representative engines produce equivalent results across supported runtimes |
| Migration | Representative delivered-state upgrade, interrupted migration, restart, duplicate migration, collision handling, recovery and secret-reference preservation |
| Scope/privacy | Environment/workspace/device/private classification; no ephemeral inputs, tokens, secrets, local journals or unrelated history in sync traffic. Phase 31D evidence: [Phase 31D acceptance](PHASE31D_ACCEPTANCE.md) (Hub free of device-only data, secrets and payload text; setting-key and ownership rejections; inventory) |
| Multi-device | At least two enrolled desktop clients converge through one Hub; one may be co-located with the Hub while retaining separate stores. Phase 31D evidence: [Phase 31D acceptance](PHASE31D_ACCEPTANCE.md) (`test:sync`, `test:e2e:sync`; two-machine LAN pass owed) |
| Offline/retry | Offline edits survive restart; replay is idempotent after dropped acknowledgments; out-of-order/stale updates cannot silently overwrite. Phase 31D evidence: [Phase 31D acceptance](PHASE31D_ACCEPTANCE.md) (Agent kill and Hub downtime, dropped acknowledgement, duplicate `opId`) |
| Conflicts/deletes | Concurrent pipeline edits, documented simple-setting policy, tombstones, old cursors, snapshot/rebase and no resurrection. Phase 31D evidence: [Phase 31D acceptance](PHASE31D_ACCEPTANCE.md) (conflict inbox, auto-merge, edit-delete, compaction rebase, 410 `cursor-expired`) |
| Identity | Owner bootstrap/recovery, session expiration, unauthorized device rejection, revocation, authentication without an external identity provider. Phase 31C evidence: [Phase 31C acceptance](PHASE31C_ACCEPTANCE.md) (owner and device paths). Phase 31D adds revoked-device sync behavior ([Phase 31D acceptance](PHASE31D_ACCEPTANCE.md): stranded operations, Continue standalone, 401 on Hub calls); sync-time verification for Internet exposure shipped in 31F ([Phase 31F acceptance](PHASE31F_ACCEPTANCE.md): per-request token re-resolution, in-transaction actor re-check, audited revoked attempts) |
| Web | Deep links/refresh, API-versus-SPA routing, standalone companion regression, private-cache isolation, CSRF/origin controls and authenticated WebSocket behavior. Phase 31E evidence: [Phase 31E acceptance](PHASE31E_ACCEPTANCE.md) (`test:e2e:hub` routes sweep and shared-state suites, the Pages `test:e2e` regression, the public-asset-only service worker; the two-machine browser pass, a real reverse proxy and the first CI runs are owed) |
| Internet mode | TLS/readiness checks, rate limiting, brute-force protections, endpoint diagnostics and absence of publicly exposed Agent/native ports. Phase 31E delivers the private-mode parts (local CA, import, proxy mode, per-principal limits, the diagnostics engine; [Phase 31E acceptance](PHASE31E_ACCEPTANCE.md)); public mode is released behind an elevated readiness gate (Phase 31F, Milestones 683–699) (PD-066); Hub-observed external reachability verification (PD-065) is one of its blockers; Phase 31F also adds built-in ACME, address-drift detection, the public firewall rule and native-listener audit, step-up re-authentication, a persisted flood guard with automatic IP blocks and owner alerts ([Phase 31F acceptance](PHASE31F_ACCEPTANCE.md)); a real Let's Encrypt issuance and a real off-LAN reachability pass remain owed |
| Lifecycle | Hub continues with Electron closed; install/start/stop/restart/update preserve canonical data; incompatible versions fail safely. Phase 31C evidence: [Phase 31C acceptance](PHASE31C_ACCEPTANCE.md) (`hub-service`, `docker-smoke`, `hub-e2e`) |
| Backup/transfer | Encrypted consistent backup, restore on a second machine, sole-authority enforcement, endpoint reconnection and stale-history handling. Phase 31G evidence: [Phase 31G acceptance](PHASE31G_ACCEPTANCE.md) (`@dude/hub-backup` round-trip and tamper cases, the Hub backup, restore, fence and confirmation-boundary specs, the device authority and rebase specs, `e2e/hub/50-backup-transfer.spec.ts` and `e2e/sync/20-restore-reconnect.spec.ts`; restore ran onto a second data directory on one machine, so the real second-machine pass, installed-service and elevated runs and the first CI runs are owed) |
| Android | Installable APK and produced AAB; portable engine parity; registered-device sync; implemented offline/cache behavior; native permission denial and revocation paths |
| Existing native safety | Filesystem/system mutation preview/confirm/replay tests remain intact; synced/imported definitions cannot execute implicitly |

Use synthetic/redacted fixtures. No release gate is satisfied by the mere presence of a UI checkbox or a unit test that repeats an implementation. Keep risk-based scope; exhaustive tests for every simple tool are still not a percentage target.

## Performance Gates

### Phase 22 hardening requirements

- warning/error budgets for individual lazy chunks, major shared chunks, startup code, desktop preload code, and large WASM/runtime payloads;
- total offline Cache Storage budgeting, not merely initial JS size;
- service-worker strategy audit so generic `*.js` matching does not accidentally prefetch every lazy tool/runtime;
- dependency-boundary validation to stop large or platform-specific packages leaking into shared startup bundles;
- shipped web-cache repair/clear tooling (Phase 26, Milestone 483).

### Still pragmatic / not raw-goal driven

- no requirement to minimize every byte at the expense of maintainability;
- no micro-benchmark for every simple tool;
- no manual tree-shaking campaign without evidence;
- no custom virtualized editor unless a concrete tool/workload needs it.

Phase 23 adds performance regression corpora for expensive parsers, diffs, hashing, directory operations, archives, and binary viewers where regressions would be user-visible.

### Distributed performance and operational acceptance

Record representative startup, migration, sync catch-up, conflict handling, memory, outbox/database growth and backup/restore measurements during the foundation phases. Choose budgets from those baselines before release; avoid inventing hardware-independent performance guarantees here.

Local tool startup/navigation must not await Hub reachability. Use bounded API requests, sync batches, retries and realtime subscriptions. Mobile uses capability-appropriate input/runtime budgets and responsive cancellation/progress.

**Phase 31I mobile budgets (emulator fixtures).** Milestone 783 measured every Android tool on x86_64 API 29 and API 36 emulators and set the input budgets in the [Phase 31I plan](PHASE31I_PLAN.md#measured-input-budgets): hash 128 KiB, csv-viewer 384 KiB, json/yaml-json/xml-formatter 2 MiB, diff 512 KiB per side, regex 64 KiB, and a kit main-thread budget (`maxInputBytes`, default 128 KiB; base64 256 KiB, case-converter 64 KiB; bespoke screens use `checkInputBudget`). The release thresholds are the worst measured value plus 25 percent: cold start 1,229 ms (API 29) and 1,879 ms (API 36), PSS after startup 162,242 and 116,027 KiB, PSS after formatting 2 MiB of JSON 297,184 and 225,572 KiB, peak RSS after the full tool run 558,785 and 479,940 KiB, Hermes bytecode 9,699,195 bytes, x86_64-fixture APK 124,079,933 bytes and AAB 54,334,849 bytes, plus a per-tool wall-time and tick-gap threshold (tick gap never above 100 ms). The full table is in [Emulator-fixture release thresholds](PHASE31I_PLAN.md#emulator-fixture-release-thresholds). These are regression gates for the emulator fixture, not hardware guarantees: physical-device thresholds come from the physical pass, which has not run, and startup is activity display rather than JS-interactive readiness. Do not load all 30–50 mobile engines or every web runtime eagerly merely because metadata is shared.

Document Hub disk-space and backup requirements, service status, logs, endpoint diagnostics, database migration state and recovery steps. Diagnostics redact secrets and content. Hosting on a sleeping laptop/desktop is supported with the documented availability tradeoff; 24/7 availability requires a powered, connected, reachable Hub.
## Accessibility Gates

Contrast thresholds, enforced over every theme × contrast × accent × category set × status set combination by `scripts/check-theme-contrast.mjs` in `npm run lint`:

- text and muted text on the background, panel and elevated panel: ≥ 4.5:1 (high contrast ≥ 7:1);
- category and status colors used as text on those surfaces: ≥ 4.5:1 (high contrast ≥ 7:1); as text on their own tinted washes: ≥ 4.5:1 (high contrast: ≥ 7:1 for accent, error, warning and success badge washes; info banners use normal text with an info-colored glyph instead);
- `on-*` text on its fill (`on-accent` on `accent`): ≥ 4.5:1 (high contrast ≥ 7:1);
- non-text: the accent (focus ring, selection) against the background and panel ≥ 3:1 in every mode; borders ≥ 3:1 in high contrast (standard-contrast borders are decorative separators);
- semantic separation: every saturated status color stays ≥ 22° of hue or ≥ 12 HSL-lightness points away from every category color and the accent, so status never reads as a category.

`npm run test:appearance` (Playwright, `e2e/appearance/`) then checks the rendered app against the production build: all 864 color/state combinations (theme × contrast × accent × category set × status set × density × motion) on Home, the Ctrl+K palette, Browse Tools, Settings › Appearance and one tool (rotating through one tool per category) — pre-paint attributes, horizontal overflow, the focus indicator, sampled text contrast (4.5:1 normal / 3:1 large; 7:1 / 4.5:1 in high contrast), no animation under Reduce, and no console errors — plus a 108-combination layout sub-matrix (theme × contrast × density × UI text size × data text size) at 1920×1080, 1440×900 and 1366×768.
## Build and Deployment

The shipped baseline has two distribution pipelines: Windows desktop and static web/PWA. The target adds an independently packaged Hub service and React Native Android AAB/APK, while retaining both shipped paths. Desktop remains the privileged local surface; Hub is authoritative for shared state.

### Shared build requirements

- framework-critical tests run before release artifacts are accepted;
- shared transformation/core logic is built once per target rather than reimplemented;
- platform boundaries prevent Electron/Node-only dependencies from contaminating browser bundles;
- capability/security-critical release gates may become stricter than general utility-tool gates under Phase 23.

### Windows desktop production build and release

Phase 8 Stage 8 already established:

1. Angular desktop-target build with service worker disabled for Electron;
2. Electron main/preload compilation;
3. `electron-builder` packaging;
4. NSIS installer publication to GitHub Releases;
5. MSIX/appx packaging for Microsoft Store submission (the appx target was dropped in Phase 31C, [PD-025](../history/DECISION_LOG.md#phase-31c-implementation-decisions): MSIX virtualizes `AppData`, which would split the resident Agent's and the app's stores);
6. a release version for every push to `master` that runs CI (Markdown-only pushes skip CI; the generated root `README.md` and `SECURITY.md` still run it) (since 2026-10-03 the patch is the commit count of `master`, set inside the runner and never committed back; `package.json` holds the `<major>.<minor>.0` base);
7. Windows packaging in `ci.yml`: the `package` job builds the installers alongside the Linux gates (`checks`, `unit`, `desktop-tests`, `web` and the Hub jobs) and repeats only the Windows-specific gates; the `publish` job, the only one allowed to write releases, waits for every gate and `package` and uploads to a draft release whose tag GitHub creates on publication. The Android acceptance jobs (`mobile-build`, `mobile-native`) are skipped when `scripts/ci-changes.mjs` finds no changed file that reaches the Android app; `mobile-package` always runs on `master`. The Pages `deploy` waits only for the gates covering the web build (`checks`, `unit`, `web`);
8. `electron-updater` for the NSIS path, with download in the background but install only after explicit “Restart & Install”; Store/App Installer infrastructure handles the MSIX path when used.

The Windows setup amendment dated 2026-09-25 remains part of the shipped behavior: Express/Custom installer choices, resumable in-app setup, saved preferences across manual reinstalls/updates, Windows-managed default-app confirmation, single-instance Explorer routing, and explicit action before imported code/HTML execution/preview.

#### Desktop release acceptance

Every production desktop release must verify, at minimum:

1. production Angular assets build successfully for the Electron target;
2. framework-critical and capability-specific release gates pass;
3. Electron main/preload/backend code compiles/packages without violating renderer/native dependency boundaries;
4. Windows installation artifacts are produced for the intended package path(s);
5. **cold launch** succeeds from a clean process state;
6. **warm launch / restore** succeeds for supported tray/session/relaunch flows without corrupting persisted layout/state;
7. preload/IPC initialization succeeds and the renderer never requires direct Node integration;
8. declared native capabilities are available and fail with an explanatory capability state when unavailable;
9. single-instance routing works for normal second-launch behavior and Explorer/Open-With handoff;
10. registered `dude://` deep-link routing works where configured;
11. file-open/folder-open routing works where configured and does not execute imported code/HTML merely by opening it;
12. local backend/proxy startup, loopback binding, and shutdown/restart behavior work for capabilities included in the release;
13. update behavior matches the package type: NSIS uses the explicit Restart & Install flow (a Store/MSIX path is not currently produced), and a desktop update never stops or removes the Hub;
14. installer/update flows preserve the user's supported saved setup choices and do not introduce unexpected privileged/destructive actions;
15. package-specific signing/identity requirements are validated when a signed or Microsoft Store build is being produced.

These checks are release invariants, not merely historical Phase 8 implementation notes. Higher-risk later capabilities may add stricter gates under Phases 22–23 and [Security Boundaries](../architecture/SECURITY_ARCHITECTURE.md#security-boundaries).

### Web companion production build

A documented build must create production-ready static assets for GitHub Pages/PWA delivery.

CI should:

1. install dependencies;
2. run framework-critical tests, including registry-wide web/desktop parity;
3. build the production web app, generate its offline map, and check cache budget and asset-group coverage;
4. prepare the GitHub Pages SPA fallback;
5. publish static output.

#### Web companion / GitHub Pages acceptance

Verify:

- root project URL loads;
- direct tool URL loads;
- browser refresh on tool URL loads;
- static assets load under repo path;
- service worker registers;
- installed PWA launches;
- local-only/shared-core tools work offline after required caching;
- browser-safe pipelines and workspaces load from a fresh route and honor offline readiness;
- desktop-only features are clearly badged rather than failing mysteriously;
- tool links preserve route, query, and fragment through 404 and service-worker recovery;
- install manifest shortcuts, file handlers, and protocol handler resolve within the web app;
- Web & Offline cache/repair actions preserve user data.

### Shared-core cross-surface parity — permanent build invariant

Whenever the same capability is declared available on both DUDE Desktop and DUDE Web, automated parity coverage should verify that the shared transformation/domain semantics remain equivalent. Platform adapters, file pickers, storage backends, native bridges, and shell presentation may legitimately differ; the deterministic operation must not silently fork into two incompatible implementations.

Phase 26 shipped registry-wide pipeline parity and web/native adapter parity for every declared fallback (Milestone 487). The rule is permanent: **shared capabilities must continue to use the same core implementation and parity contract in subsequent releases.** A platform-specific implementation is acceptable only where the platform genuinely requires different behavior, and that difference must be explicit in capability metadata/tests rather than accidental drift.

### Future distribution

Phase 39 adds macOS/Linux packaging and signed non-Store distribution. Later CLI/extensions/SDKs get their own release channels without duplicating core logic.

### Deployment and Packaging

The project should produce artifacts such as:

```text
DUDE Desktop Installer
DUDE Hub Service binaries/package
Angular Web build
React Native Android AAB
React Native Android APK
Optional iOS application later
```

A single desktop installer may install both Client/Agent and Hub components based on user selection.

Example Hub packaging includes a standalone `dude-hub.exe` or a Node service, running independently of the Electron UI.

#### CI

GitHub Actions or equivalent project automation may build:

```text
Angular web
Hub service
Desktop installer
Android AAB/APK
tests
native helpers
```

CI infrastructure is a build/development concern, not a runtime dependency of the user's DUDE environment.

The user must be able to run DUDE after installation without the project's CI provider being involved.

### Packaging, updates and lifecycle acceptance

Retain NSIS/GitHub Releases packaging from Phase 8; the MSIX/appx target was dropped in Phase 31C. As built in 31C, the desktop NSIS installer embeds the separate, elevated `DUDE-Hub-Setup.exe` behind an interactive, default-off page that silent and update runs never trigger; the release workflow publishes the Hub installer and a combined `SHA256SUMS`. The Hub installer has its own Apps & Features entry, supports `/S` and an `/UPDATE` stop-replace-start mode, and its uninstaller reports the registered-device count and keeps `%ProgramData%\DUDE\Hub` unless a doubly confirmed purge is chosen. Update Hub in the desktop elevates the bundled installer in `/UPDATE` mode and is offered only from a per-machine install. Binaries are unsigned; see [Windows setup](../WINDOWS_SETUP.md). A desktop installer may add optional Hub installation without enrolling another machine into a new environment automatically.

The Hub package must support install/configure/start/stop/restart/status/uninstall independently of the Electron window, defined service identity and least privilege, persistent data directories, and safe upgrade/migration/recovery. Client uninstall/update must not delete or stop a shared Hub implicitly. Removing canonical data requires a separate explicit destructive action and recovery guidance.

Build the standalone Pages Angular artifact separately from the Hub-serving configuration. Release Android APK and AAB artifacts using documented signing/versioning and secure CI secret handling; an AAB is a distribution artifact, while APK/device installation verifies runtime behavior. iOS remains a later path with its own packaging and acceptance.

CI validates framework/runtime dependency boundaries, shared contract compatibility and supported cross-runtime engine parity, builds native helpers, and produces the relevant artifacts. CI/provider availability is not a runtime dependency. Deliberately plan version coordination among service, desktop, web and Android, preserving existing explicit-install update semantics and refusing unsafe schema downgrades.

Public access is not enabled as a side effect of installation. Setup explains public IP/IPv6/CGNAT limitations, DNS/dynamic DNS, TLS trust, forwarding/firewall policy, optional VPN and optional relay/tunnel choices. Readiness checks must distinguish operator-verified configuration from genuinely verified external reachability.

## Documentation Deliverables

`README.md` and `ADDING_A_TOOL.md` exist today, but Phase 22 turns documentation into a partially generated contract rather than a manually drifting inventory.

### README

Must cover:

- product purpose and desktop-first positioning;
- Windows download/install/update path;
- web companion / GitHub Pages URL and PWA behavior;
- local development;
- production builds for both surfaces;
- architecture summary;
- security/privacy model;
- tool catalog and capability/platform matrix;
- self-hosted/BYO infrastructure where relevant.

Tool lists, tool counts, category indexes, supported-platform tables, network/privacy disclosures, confidence status, and similar mechanical facts should be generated from canonical registry/manifest metadata once Phase 22 lands.

### `ADDING_A_TOOL.md`

This remains a critical deliverable and should explain the post-Phase-22 architecture:

1. create the tool folder;
2. define/own the local manifest metadata;
3. create component/UI;
4. keep transformation logic framework-neutral where practical;
5. declare I/O contract;
6. choose persistence policy;
7. choose worker policy;
8. choose network policy;
9. declare platform/native capabilities;
10. add pipeline/workspace adapter only when meaningful;
11. add tests appropriate to consequence level;
12. verify generated registry/search/sidebar/command-palette discovery;
13. verify desktop/web availability behavior;
14. verify direct web URL and desktop handoff/deep-link behavior where applicable;
15. satisfy conformance/registry validation.

Goal:

A simple new tool should still be addable without studying the full shell implementation, and adding tool #500 should not be structurally more dangerous than adding tool #50.

### Additional living documentation

Phase 22 explicitly refreshes `AGENTS.md`, security documentation, platform documentation, cache/bundle strategy, and architecture notes so they describe the actual post-Phase-21/post-desktop system rather than accumulating contradictory amendments.

### Distributed-release documentation

Before 31I, document standalone versus distributed modes; Client/Agent/Hub terminology; private/public/VPN deployment; Windows service lifecycle; owner setup and recovery; registration/revocation; scope and credential rules; first-sync migration; offline/outbox/conflict UX; compatibility policy; encrypted backup/restore/transfer; endpoint/TLS/DNS troubleshooting; and Android build/install/offline behavior.

Update tool-author guidance for framework-neutral engines, portable metadata, separate Angular/React Native presentation bindings, capability checks, scoped persistence, explicit sync consent, runtime compatibility and shared fixtures. Keep baseline source-path references traceable during package migration, and regenerate tool/capability inventories from metadata rather than hand-maintained platform lists.

## DUDE 2.0 Distributed Release Definition of Done — All Planned

The historical V1 checklist above remains a delivered record. The following checklist is separate and started unchecked; an item is checked only when its evidence is recorded in a phase acceptance document. Every item was checked at Milestone 786 against the evidence table in [Phase 31I acceptance](PHASE31I_ACCEPTANCE.md#dude-20-definition-of-done-status).

- [x] Delivered Windows tools, routes, projects/workspaces/pipelines, history, appearance, setup and native safety retain their existing behavior.
- [x] Standalone Windows and GitHub Pages/PWA usage require neither Hub nor account.
- [x] Framework-neutral engines, domain/contracts/validation/registry/sync packages have enforced platform boundaries and shared fixtures.
- [x] Existing desktop state migrates safely into scoped repositories/Device Store with interruption recovery and secure credential references.
- [x] A distributed environment has exactly one user-owned authoritative Hub, separate canonical SQLite WAL persistence and independent background-service lifecycle.
- [x] Owner authentication, recovery, device registration and revocation work without mandatory external identity/application/database services.
- [x] At least two enrolled desktop installations synchronize environment preferences, favorites, selected projects/workspaces and pipeline definitions with explicit consent and scope. (Phase 31D; the two-physical-machine pass is recorded in [Phase 31I acceptance](PHASE31I_ACCEPTANCE.md), G3.)
- [x] Offline changes survive restart, replay idempotently and expose revision conflicts, rejected operations and deletes safely. (Phase 31D, desktops.)
- [x] Device/private settings, native paths/endpoints, secrets, ephemeral inputs and local journals/history do not leak into ordinary synchronization. (Phase 31D, desktops.)
- [x] Hub-hosted Angular supports authenticated environment access, browser-local safe tools, direct routes and realtime foundation. (Phase 31E, private mode; the two-machine browser pass is recorded in [Phase 31I acceptance](PHASE31I_ACCEPTANCE.md), G3.)
- [x] Private mode is default; deliberate Internet mode passes security/readiness gates without exposing raw native services. (Private mode shipped in 31E; Internet mode is released behind an elevated readiness gate (Phase 31F, Milestones 683–699), and the 31F exit gate closed in Milestone 699; the real-network passes (Let's Encrypt, off-LAN from a phone on cellular) are recorded in [Phase 31I acceptance](PHASE31I_ACCEPTANCE.md), G4.)
- [x] Hub downtime leaves installed local tools/cached state useful and accurately disables unavailable synchronization/collaboration.
- [x] A consistent encrypted backup restores on another machine; controlled transfer retains one authority and safely reconnects/rebases clients. (Phase 31G, desktops and Hub web; verified by real-process drills onto a second data directory on one machine, and the real second-machine pass is recorded in [Phase 31I acceptance](PHASE31I_ACCEPTANCE.md), G5. Android reconnect is recorded in 31I, group B.)
- [x] React Native Android APK/AAB artifacts exist; the client authenticates/registers, synchronizes supported state and implements defined offline/cache behavior.
- [x] Approximately 30–50 named runtime-compatible mobile tools have usable native UI, appropriate input handling and parity verification; platform-specific/native tools are explicitly scoped.
- [x] Cross-client schema/protocol/version compatibility, installer/service lifecycle and upgrade/recovery behavior are verified and documented.
- [x] [Distributed release verification matrix](#distributed-release-verification-matrix) risk-based verification and documentation deliverables pass; implementation evidence is recorded per stage.
- [x] Deferred remote execution, E2EE credential sync, automatic failover, multi-master, complete mobile tool parity and vendor-operated hosting are not implied by the release.

**Release gate:** Phases 31A–31I and this checklist must pass before DUDE is represented as delivering the complete initial distributed desktop/web/mobile scope. A private desktop/Hub preview at 31G may be useful, but is not completion of the Android-inclusive release. Richer collaboration in 31J followed and closed at Milestone 815 ([acceptance](PHASE31J_ACCEPTANCE.md)); the authenticated WebSocket/realtime foundation may not be omitted.

## SaveSphere First Release Definition of Done — All Planned

SaveSphere is built as Phases 32-SS1 to 32-SS6 ([decisions PD-116–PD-140](PHASE32SS_PLAN.md), [SaveSphere documentation](../savesphere/README.md)); only 32-SS1 is built. Its first release gate closes at the end of 32-SS5 ([PD-117](PHASE32SS_PLAN.md)). Every item below starts unchecked and is checked only when its evidence is recorded in a phase acceptance document. The Platform items stay unchecked because their live evidence is owed: the automated evidence and the owed pass that ticks each are noted beside it. Each 32-SS phase also has its own exit gate in the [Roadmap](ROADMAP.md#savesphere-program). The testing posture is unchanged: protect against data loss and broken trust rather than chase coverage.

**Platform (32-SS1, built at Milestone 855; unchecked until the owed passes in the [acceptance script](PHASE32SS1_ACCEPTANCE.md#guided-manual-acceptance-script) are recorded)**
- [ ] A fresh Windows install designated as Hub runs the provisioning wizard to completion: storage tiers and services are created and reported, the owner's bare domain is reachable through the managed Cloudflare Tunnel (and, separately, through direct Public mode), and both pass the readiness gate. *Automated: the wizard, provisioning, tunnel and readiness specs and `70-platform`. Owed: S1, S2, S3, S8.*
- [ ] Google sign-in binds only after a signed-in round-trip, several owner accounts can be linked, an unlinked Google account is refused and audited, and the Hub stays fully usable with Google unreachable through the password and recovery-code fallback. *Automated: the OIDC specs and `70-platform` test 6. Owed: S6, S7.*
- [ ] Every route on the domain requires a session except the documented exceptions; the GitHub Pages companion still works anonymously. *Automated: the route-gating probe. Owed: S9.*
- [ ] Backup v2 streams a Hub larger than 512 MiB, including the blob store, to each destination kind. The backup verifies and restores on a second machine with the 31G authority rules, and a warm-standby device can be promoted by hand. *Automated: the 591 MiB run, MinIO and the restore specs; the Google Drive and OneDrive destinations are not built (Milestones 856–857), so "each destination kind" is met for local and S3 only until they ship. Owed: S11, S12, S13.*

**Preservation and synchronization (32-SS2, 32-SS3)**
- [ ] No captured or edited content is lost:
  - offline captures and edits on desktop, Android and the PWA capture queue survive restart and replay idempotently;
  - concurrent edits merge, or produce a linked conflict copy, never silent loss;
  - interrupted uploads resume;
  - a capture retried after a timeout never creates a duplicate.
- [ ] Originals are byte-identical after capture, import, sync, backup and restore (SHA-256 verified). Derived text never replaces an original, and tiered history thins versions without ever thinning an original.
- [ ] Each owner source imports from a real export of the owner's own data, with preview, idempotent re-run and a report: Samsung Notes PDFs, Evernote ENEX, OneNote, WhatsApp, Teams, Instagram, TikTok and email archives. Every conversion gap found is either fixed or recorded as a known limitation.
- [ ] The export round-trips. The Markdown mirror round-trips both ways with conflict copies and no deletion outside its folder, under the Destructive-Action Contract.

**Editing (32-SS2, 32-SS4)**
- [ ] Rich text, hybrid ink and text, PDF annotation (original untouched) and canvases work on the declared surfaces. Ink works on the Galaxy S25 Ultra, a Samsung S Pen tablet and a Windows pen, and is view-only elsewhere. Physical-device passes are recorded.

**Organization, search and Copilot (32-SS5)**
- [ ] Search finds typed text, OCR text, recognized handwriting, transcripts and PDF annotations on a corpus of at least 50,000 items within measured, recorded budgets.
- [ ] Confidence-gated organization applies only above its threshold, records undoable "AI" revisions, never touches a pinned field, and never deletes, merges or rewrites owner text.
- [ ] Copilot answers cite only sources that were actually retrieved, and an unverifiable citation is dropped. Prompt-injection fixtures in captured content cannot trigger writes, fetches or vault access. Every AI task's disclosure and the spend cap are enforced, and SaveSphere stays usable with no AI provider configured.
- [ ] Reminders and resurfaced items arrive on each configured channel with content-free payloads.

**Security (all phases)**
- [ ] The vault never leaks: it is absent from indexes, AI requests, the mirror, ingest and sharing, appears in backups only as ciphertext, and re-locks when idle.
- [ ] Ingest tokens are scoped, hashed, revocable and refused outside the ingest path. The SSRF suite (private, metadata and IPv6 forms, redirects, DNS rebinding) passes. Mail from senders outside the allowlist, or failing SPF/DKIM, is rejected.
- [ ] New routes are contract-first with `@dude/api-client` parity and closed-list audit events, and no credential or content is logged.

**Release gate:** 32-SS1 to 32-SS5 and this checklist must pass before SaveSphere is represented as released. 32-SS6 sharing has its own exit gate (guest isolation, link expiry and revocation, audit) and is not part of the first release.

## Tool Verification

Follow [Adding a Tool](../../ADDING_A_TOOL.md) for the existing local tool recipe and its verified commands: development discovery, pure-transform tests, lint/design checks, production build and fresh direct-route verification. High-consequence changes additionally satisfy [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract) and capability-specific gates.

## Versioning and Upgrade Evidence

“DUDE 2.0” names release scope. Milestone 786 declared it by setting the root `package.json` base to `2.0.0`, so every surface now releases as `2.0.<commit count>` (Android `versionCode` stays the commit count). It was aligned deliberately with existing automatic versioning, supported client/Hub protocol windows and documented migration/downgrade recovery. [Contract Versioning and Compatibility](../architecture/SYSTEM_ARCHITECTURE.md#contract-versioning-and-compatibility), [Delivered-store Migration](../architecture/DATA_SYNC_ARCHITECTURE.md#migration-from-the-delivered-local-stores) and [Packaging, Updates and Lifecycle Acceptance](#packaging-updates-and-lifecycle-acceptance) define the detailed requirements.
