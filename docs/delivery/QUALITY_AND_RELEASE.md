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
- [Tool Verification](#tool-verification)
- [Versioning and Upgrade Evidence](#versioning-and-upgrade-evidence)

## Testing Strategy

Selected quality posture:

> Protect critical paths with risk-based release gates; the historical V1 posture was “ship first.”

Testing should protect the framework and critical paths, not chase a coverage number.

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
| Scope/privacy | Environment/workspace/device/private classification; no ephemeral inputs, tokens, secrets, local journals or unrelated history in sync traffic |
| Multi-device | At least two enrolled desktop clients converge through one Hub; one may be co-located with the Hub while retaining separate stores |
| Offline/retry | Offline edits survive restart; replay is idempotent after dropped acknowledgments; out-of-order/stale updates cannot silently overwrite |
| Conflicts/deletes | Concurrent pipeline edits, documented simple-setting policy, tombstones, old cursors, snapshot/rebase and no resurrection |
| Identity | Owner bootstrap/recovery, session expiration, unauthorized device rejection, revocation, authentication without an external identity provider |
| Web | Deep links/refresh, API-versus-SPA routing, standalone companion regression, private-cache isolation, CSRF/origin controls and authenticated WebSocket behavior |
| Internet mode | TLS/readiness checks, rate limiting, brute-force protections, endpoint diagnostics and absence of publicly exposed Agent/native ports |
| Lifecycle | Hub continues with Electron closed; install/start/stop/restart/update preserve canonical data; incompatible versions fail safely |
| Backup/transfer | Encrypted consistent backup, restore on a second machine, sole-authority enforcement, endpoint reconnection and stale-history handling |
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

Local tool startup/navigation must not await Hub reachability. Use bounded API requests, sync batches, retries and realtime subscriptions. Mobile uses capability-appropriate input/runtime budgets and responsive cancellation/progress. Do not load all 30–50 mobile engines or every web runtime eagerly merely because metadata is shared.

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
5. MSIX/appx packaging for Microsoft Store submission once real Partner Center identity values replace placeholders;
6. patch-version/tag automation on pushes to `master`;
7. a separate Windows release workflow with its own test gate;
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
13. update behavior matches the package type — NSIS uses the explicit Restart & Install flow, while MSIX/Store/App Installer follows its Windows-managed path;
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

Retain NSIS/GitHub Releases and MSIX packaging behavior from Phase 8; Microsoft Store submission remains dependent on real Partner Center identity/signing requirements rather than being implied by package generation. A desktop installer may add optional Hub installation without enrolling another machine into a new environment automatically.

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

The historical V1 checklist above remains a delivered record. The following checklist is separate and initially unchecked; reconciliation alone completes none of it.

- [ ] Delivered Windows tools, routes, projects/workspaces/pipelines, history, appearance, setup and native safety retain their existing behavior.
- [ ] Standalone Windows and GitHub Pages/PWA usage require neither Hub nor account.
- [ ] Framework-neutral engines, domain/contracts/validation/registry/sync packages have enforced platform boundaries and shared fixtures.
- [ ] Existing desktop state migrates safely into scoped repositories/Device Store with interruption recovery and secure credential references.
- [ ] A distributed environment has exactly one user-owned authoritative Hub, separate canonical SQLite WAL persistence and independent background-service lifecycle.
- [ ] Owner authentication, recovery, device registration and revocation work without mandatory external identity/application/database services.
- [ ] At least two enrolled desktop installations synchronize environment preferences, favorites, selected projects/workspaces and pipeline definitions with explicit consent and scope.
- [ ] Offline changes survive restart, replay idempotently and expose revision conflicts, rejected operations and deletes safely.
- [ ] Device/private settings, native paths/endpoints, secrets, ephemeral inputs and local journals/history do not leak into ordinary synchronization.
- [ ] Hub-hosted Angular supports authenticated environment access, browser-local safe tools, direct routes and realtime foundation.
- [ ] Private mode is default; deliberate Internet mode passes security/readiness gates without exposing raw native services.
- [ ] Hub downtime leaves installed local tools/cached state useful and accurately disables unavailable synchronization/collaboration.
- [ ] A consistent encrypted backup restores on another machine; controlled transfer retains one authority and safely reconnects/rebases clients.
- [ ] React Native Android APK/AAB artifacts exist; the client authenticates/registers, synchronizes supported state and implements defined offline/cache behavior.
- [ ] Approximately 30–50 named runtime-compatible mobile tools have usable native UI, appropriate input handling and parity verification; platform-specific/native tools are explicitly scoped.
- [ ] Cross-client schema/protocol/version compatibility, installer/service lifecycle and upgrade/recovery behavior are verified and documented.
- [ ] [Distributed release verification matrix](#distributed-release-verification-matrix) risk-based verification and documentation deliverables pass; implementation evidence is recorded per stage.
- [ ] Deferred remote execution, E2EE credential sync, automatic failover, multi-master, complete mobile tool parity and vendor-operated hosting are not implied by the release.

**Release gate:** Phases 31A–31I and this checklist must pass before DUDE is represented as delivering the complete initial distributed desktop/web/mobile scope. A private desktop/Hub preview at 31G may be useful, but is not completion of the Android-inclusive release. Richer collaboration in 31J may follow; authenticated WebSocket/realtime foundation may not be omitted.

## Tool Verification

Follow [Adding a Tool](../../ADDING_A_TOOL.md) for the existing local tool recipe and its verified commands: development discovery, pure-transform tests, lint/design checks, production build and fresh direct-route verification. High-consequence changes additionally satisfy [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract) and capability-specific gates.

## Versioning and Upgrade Evidence

“DUDE 2.0” names release scope, not an already-issued package/tag version. Align it deliberately with existing automatic versioning, supported client/Hub protocol windows and documented migration/downgrade recovery. [Contract Versioning and Compatibility](../architecture/SYSTEM_ARCHITECTURE.md#contract-versioning-and-compatibility), [Delivered-store Migration](../architecture/DATA_SYNC_ARCHITECTURE.md#migration-from-the-delivered-local-stores) and [Packaging, Updates and Lifecycle Acceptance](#packaging-updates-and-lifecycle-acceptance) define the detailed requirements.
