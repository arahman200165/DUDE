# DUDE Product Decision Log

This document preserves the original interview, scope evolution, commercial context and complete source reconciliation. Historical or superseded decisions do not override active specifications.

Read [the master PRD](../DUDE_PRD.md) first. Product direction and invariants live there; this document owns provenance only and does not override active requirements.

Related: [DUDE — Product Requirements](../DUDE_PRD.md) · [DUDE Delivery History](DELIVERY_HISTORY.md) · [DUDE Roadmap](../delivery/ROADMAP.md).

## Contents

- [Decision Index](#decision-index)
- [Interview Questions and Answers](#interview-questions-and-answers)
- [V1 Scope in One Sentence (Delivered)](#v1-scope-in-one-sentence-delivered)
- [Scope Evolution Record](#scope-evolution-record)
- [Commercialization Context](#commercialization-context)
- [Reconciliation Decisions and Requirement Traceability](#reconciliation-decisions-and-requirement-traceability)
- [Original Consolidated PRD Header](#original-consolidated-prd-header)

## Decision Index

| ID | Decision | Current authority / provenance |
|---|---|---|
| PD-001 | Angular selected for the shared desktop/web UI | [Interview decisions](#interview-questions-and-answers) |
| PD-002 | Local-first execution and selective persistence | [Local First](../DUDE_PRD.md#local-first) / [Persistence Policy](../architecture/DATA_SYNC_ARCHITECTURE.md#persistence-policy) |
| PD-003 | Desktop becomes the canonical privileged workbench | [Desktop and Web Positioning](../DUDE_PRD.md#desktop-is-canonical-web-preserves-zero-install-reach) |
| PD-004 | Self-hosted user-owned Hub; no mandatory vendor runtime | [Self-hosted by Default](../DUDE_PRD.md#self-hosted-by-default) |
| PD-005 | Exactly one authoritative Hub for synchronized state | [Architectural Invariants](../DUDE_PRD.md#architectural-invariants) |
| PD-006 | Standalone operation remains supported | [Standalone Operation and Enrollment](../DUDE_PRD.md#standalone-operation-and-environment-enrollment) |
| PD-007 | GitHub Pages/PWA retained alongside Hub web | [Two Web Modes](../architecture/SYSTEM_ARCHITECTURE.md#routing-and-isolation-across-the-two-web-modes) |
| PD-008 | React Native Android shares portable core, separate UI | [React Native Mobile Application](../product/PRODUCT_SPEC.md#react-native-mobile-application) |
| PD-009 | No DUDE-operated hosted SaaS under current boundaries | [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries) |
| PD-010 | Registration/sync do not authorize remote native jobs | [Future Remote Execution](../architecture/SECURITY_ARCHITECTURE.md#future-remote-execution) |
| PD-011 | Initial SQLite authority, separate device replicas | [Canonical Hub Database](../architecture/DATA_SYNC_ARCHITECTURE.md#canonical-hub-database) |
| PD-012 | Backup/transfer precedes the Android-inclusive gate | [Phase 31G](../delivery/ROADMAP.md#phase-31g) / [Phase 31I](../delivery/ROADMAP.md#phase-31i) |
| PD-013 | `node:sqlite` is the Device State Store engine | [Phase 31B decisions](#phase-31b-implementation-decisions) |
| PD-014 | Utility-process state service; Electron main is the only broker (lifecycle superseded by PD-026) | [Phase 31B decisions](#phase-31b-implementation-decisions) / [System Architecture](../architecture/SYSTEM_ARCHITECTURE.md#device-state-store-service-vs-device-agent) |
| PD-015 | Renderer origin is the privileged `dude-app://app/` scheme | [Phase 31B decisions](#phase-31b-implementation-decisions) |
| PD-016 | Collaboration transport unchanged (pinned `wss://` fallback not needed) | [Phase 31B decisions](#phase-31b-implementation-decisions) |
| PD-017 | Always-on coalesced standalone outbox with an explicit journaled list | [Phase 31B decisions](#phase-31b-implementation-decisions) / [Device State Store](../architecture/DATA_SYNC_ARCHITECTURE.md#device-state-store) |
| PD-018 | Tool `local` preferences default to environment scope | [Phase 31B decisions](#phase-31b-implementation-decisions) / [Settings scope](../architecture/DATA_SYNC_ARCHITECTURE.md#settings-must-be-scope-aware) |
| PD-019 | Usage/insights and Home layout are environment-scoped | [Phase 31B decisions](#phase-31b-implementation-decisions) |
| PD-020 | LLM chat over sender-checked IPC | [Phase 31B decisions](#phase-31b-implementation-decisions) / [Security boundaries](../architecture/SECURITY_ARCHITECTURE.md#renderer-origin-and-device-store-boundary-phase-31b) |
| PD-021 | Best-effort one-shot import; legacy-compat code removed | [Phase 31B decisions](#phase-31b-implementation-decisions) |
| PD-022 | Two separate two-step resets; display name never the hostname | [Phase 31B decisions](#phase-31b-implementation-decisions) |
| PD-023 | Hub runtime: Fastify, REST `/api/v1`, TypeBox contracts | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-024 | Hub packaging: Node SEA, Windows service (WinSW), Docker and foreground modes | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-025 | Hub install, update and uninstall independent of the desktop client; appx dropped | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-026 | State service becomes the resident per-user Device Agent (supersedes PD-014 lifecycle) | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-027 | One owner: Argon2id password plus single-use recovery codes | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-028 | Owner bootstrap by one-time setup token and ACL'd hand-off | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-029 | Owner recovery: codes, elevated reset, recovery-trusted device (client-side gate) | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-030 | Cookie sessions for browsers; device-bound bearer session for the Agent | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-031 | Ed25519 device credential and pairing-code enrollment | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-032 | Pinned self-signed HTTPS, loopback default, explicit LAN mode, `tls rotate` | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-033 | Security baseline from the first endpoint | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-034 | Minimal authenticated WebSocket realtime foundation | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-035 | Hub web: `hub` build, `hub-web` host kind, Settings sections, shell exception #12 | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-036 | Hub-minted environment identity; canonical SQLite skeleton; `@dude/sqlite-store` | [Phase 31C decisions](#phase-31c-implementation-decisions) |
| PD-037 | Single release train with negotiated protocol versions | [Phase 31C decisions](#phase-31c-implementation-decisions) |

PD-001 to PD-012 index existing decisions without inventing new decisions or dates. PD-013 to PD-022 are implementation decisions taken during Phase 31B and dated in [their own section](#phase-31b-implementation-decisions). PD-023 to PD-037 are Phase 31C decisions recorded before implementation in [their own section](#phase-31c-implementation-decisions); PD-026 supersedes the lifecycle question left open in PD-014. Detailed dated evidence and the full reconciliation table follow.

The reconciliation record below describes the 2026-10-01 consolidation of the baseline and amendment. References to “this master document” in that record describe the consolidated source. The current authority order is now defined by [the master PRD](../DUDE_PRD.md#authority-order).

## Interview Questions and Answers

This appendix captures the requirements interview that determined the original weekend PRD, condensed to a decision log.

| # | Topic | Decision |
|---|---|---|
| Q1 | Primary goal | Hybrid — genuinely useful personally, structured and polished enough to share. |
| Q2 | Hard scope constraint | Build the framework first; tool count is secondary. |
| Q3 | Frontend stack | Angular — strong conventions, TypeScript, DI, routing, structured organization. |
| Q4 | Architecture strictness | Moderately structured — shared conventions/metadata contracts, but tools may diverge where UX requires it. |
| Q5 | Privacy/runtime model | Local-first by default, with optional public API integrations later that degrade gracefully offline. |
| Q6 | Definition of done | A polished, deployable foundation with a limited number of good tools. |
| Q7 | Primary UX success metric | Balanced — prioritize speed and consistency, add keyboard acceleration where valuable. |
| Q8 | Persistence | Per-tool choice, with selective persistence as the default (safe preferences persist, sensitive payloads don't). |
| Q9 | Mandatory edge cases | Failure isolation, offline behavior, and GitHub Pages routing/deployment reliability are mandatory; large and sensitive inputs must be allowed, not rejected by policy. |
| Q10 | Initial tool-set strategy | A framework-showcase set exercising different patterns, with the broader set organized into a roadmap. |
| Q11 | Navigation | Hybrid — deck + sidebar + global search/command palette + dedicated routes, no IDE-style persistent tabs. **Amended 2026-09-21:** narrowed, not reversed — multi-tool tabs and resizable workbench panels shipped in Phase 21; the boundary is "a multi-tool workbench, not a source-code IDE." A Monaco-style full IDE remains explicitly out of scope ([Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries)). **Current standing boundary:** later editor/LSP/terminal surfaces may exist (Phases 77–80), but DUDE must not become a conventional VS Code clone or editor-first IDE ([Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries)). |
| Q12 | Visual style | Minimal developer console, dark-only, super dense. **Amended 2026-09-18:** dark-only stays fixed, but the theme became explicitly bright and colorful rather than muted/monochrome — bold, saturated accent colors used functionally (categories, status, active state) against a dark base. "Minimal ornamentation" applies to shapes/effects, not color intensity. See [Appearance System](../product/UX_SPEC.md#appearance-system) for the current, authoritative visual spec. **Resolved 2026-09-29 (Phase 30K, Milestones 577–585):** DUDE is no longer dark-only. Dark stays the default and the bright, colorful, dense identity is unchanged, while Light/System themes, high contrast, accent and category palettes, color-blind-safe status colors, density presets, UI and data font preferences, and reduced motion are controlled first-party options ([Theme](../product/UX_SPEC.md#theme), [Color System](../product/UX_SPEC.md#color-system), [Accessibility](../product/UX_SPEC.md#accessibility)). Customization means composing first-party, pre-validated options per axis. Free color pickers, a user token editor, arbitrary user themes, per-tool themes, and bundled web fonts remain out of scope. |
| Q13 | Dependency strategy | Library-forward — prefer mature libraries where they accelerate reliable delivery. |
| Q14 | Offline/PWA depth | Installable PWA with offline shell and local tools; network-dependent tools explicitly expose connectivity requirements. |
| Q15 | Testing/accessibility quality bar | Ship first — test architecture-critical pieces and obvious regressions, not exhaustive coverage. |
| Q16 | API-backed tool credential policy | User-supplied API keys only; never bundle private keys; session-only by default with explicit opt-in persistence. |
| Q17 | GitHub Pages routing | Clean bookmarkable routes with a `404.html` SPA fallback, not hash routing. |
| Q18 | Browser/device target | Original V1 target: desktop Chromium web/PWA. **Current product hierarchy:** Windows desktop Electron is canonical; desktop Chromium/GitHub Pages is the secondary zero-install companion; cross-platform desktop and broader web parity are future roadmap work. |
| Q19 | Computational isolation | A shared worker execution layer tools can opt into, with cancellation/termination support. |
| Q20 | Executable tools | Deferred for the weekend; sandboxing allowed later. (Later shipped — see [Phase 6](DELIVERY_HISTORY.md#phase-6).) |
| Q21 | Measurable framework success criteria | Extension speed and deployment reliability as hard pass/fail; performance/isolation and architecture clarity as strong targets. |

## V1 Scope in One Sentence (Delivered)

> Ship a dark-only but highly colorful, dense, desktop-Chromium Angular PWA on GitHub Pages with a reusable tool registry, clean routes, command/search navigation, per-tool persistence, worker-based failure isolation, offline support, documentation, and exactly enough varied utilities to prove the framework—then stop.

This was the goal for V1 specifically, not a permanent stopping point — the “then stop” reflected the original weekend scope gate. Its “dark-only” is likewise V1 history: Phase 30K later added first-party appearance options with Dark as the default ([Theme](../product/UX_SPEC.md#theme)). It also preserves the historical fact that V1 was defined around the Chromium/GitHub Pages PWA before the desktop track existed. With V1 and Phases 1–21 delivered, the current product hierarchy is desktop-canonical/web-companion and work continues per the [Roadmap Direction](../delivery/ROADMAP.md#roadmap-direction) roadmap (see [Delivered Baseline through Phase 31](DELIVERY_HISTORY.md#delivered-baseline-through-phase-31)).

## Scope Evolution Record

This appendix records how the original weekend-era exclusions evolved into the durable boundaries in [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries)–[Historical Exclusions Now Treated as Roadmap Territory](../product/PRODUCT_SPEC.md#historical-exclusions-now-treated-as-roadmap-territory). It is historical context only; all phase references below use the **current roadmap numbering** so the appendix cannot conflict with the authoritative roadmap.

### Weekend-era exclusions

The original scope intentionally excluded:

- user accounts;
- cloud synchronization;
- a DUDE-operated cloud backend;
- a DUDE-operated always-on product database;
- telemetry/analytics platforms;
- collaborative editing;
- a DUDE-operated hosted snippet service;
- extension marketplaces and remotely installed plugins;
- third-party authentication;
- multi-device preferences;
- mobile-first layout;
- Firefox/Safari-specific optimization;
- a Monaco-style full IDE workspace;
- cloud-hosted API proxies;
- cloud-hosted secret storage;
- elaborate onboarding/tutorial tours;
- social sharing;
- SEO-heavy content pages;
- a public API documentation portal;
- design-system extraction/component package publishing;
- broad accessibility certification;
- exhaustive cross-browser/E2E/unit-test coverage;
- a dedicated bundle-size optimization project;
- localization/i18n.

Those exclusions were useful for protecting the weekend MVP, but many were later reclassified as shipped capabilities, distant roadmap items, or conditional concepts rather than permanent prohibitions.

### Desktop and native-capability decision — 2026-09-20

Native desktop packaging was opened because useful capabilities such as raw networking, arbitrary/background filesystem access, processes, OS integration, local servers, secure OS-backed credentials, and live database/container access cannot be reproduced faithfully by a browser tab.

The decision allowed:

- the shipped Electron application in Phase 8;
- a local bundled backend where a native capability genuinely requires one;
- OS-backed `secure-local` storage;
- native filesystem/process/network/OS integration;
- LAN services and user-operated/self-hosted infrastructure.

The current boundary is stricter and clearer than the early carve-out language: **DUDE Desktop is canonical; DUDE Web is the browser-safe companion; no DUDE-operated hosted cloud is authorized while [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries) stands.**

### Collaboration decision — 2026-09-20

Phase 8 Stages 6–7 shipped real-time Markdown collaboration through:

- a same-machine/LAN collaboration server; and
- a user-operated BYO relay for cross-network sessions.

The relay is not a DUDE-operated service. Broader accountless collaboration is tracked in Phase 53. A DUDE-hosted collaboration service remains blocked by [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries) unless the product owner explicitly changes that boundary.

### Broader scope reopening — 2026-09-21 onward

The following capabilities moved from blanket exclusion into explicit shipped/current roadmap scope:

- **multi-tool tabs, panels, Saved Sessions, scripted workflow steps, and local history** — shipped in Phase 21;
- **multi-window OS workflows** — Phase 35;
- **self-hosted/BYO snippet sharing** — Phase 32;
- **local secrets vault** — Phase 35, with deeper secrets work in Phase 51;
- **VS Code integration** — Phase 37;
- **browser extension** — Phase 38;
- **light mode/theme customization/accessibility appearance controls** — shipped in Phase 30K (Milestones 577–585);
- **macOS/Linux desktop support** — Phase 39;
- **mobile companion** — originally Phase 91; the initial React Native Android release now moves to Phases 31H–31I, with advanced mobile/iOS retained at Phase 91;
- **Firefox/Safari parity and broader web compatibility** — Phase 92;
- **local plugin SDK / signed extension ecosystem** — Phases 56–57;
- **public SDK/documentation/component surfaces** — Phases 97–98;
- **localization/i18n and accessibility maturity** — Phase 94.

These roadmap entries do not erase the standing boundaries in [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries). In particular, editor/LSP/terminal/project work remains subordinate to the developer-workbench identity, and hosted-account/cloud concepts in the distant horizon remain conditional while the no-DUDE-hosted-cloud boundary stands.

### Phase 31B implementation decisions

These decisions were made while delivering Phase 31B (Milestones 616–627, recorded 2026-10-02). Each is current unless a later decision supersedes it. Evidence is in the [Phase 31B acceptance record](../delivery/PHASE31B_ACCEPTANCE.md).

**PD-013 — `node:sqlite` is the Device State Store engine.** *Context:* the store needs transactional, crash-safe local SQL without a native build step. *Decision:* use Node's built-in `node:sqlite` (`DatabaseSync`), verified in the shipped Electron/Node (SQLite 3.53.4) in WAL mode with `synchronous=FULL`. *Why not an addon:* a native module (for example `better-sqlite3`) adds a per-Electron-ABI rebuild and packaging burden for a capability the runtime already ships. *Consequence:* a Node runtime without `node:sqlite` cannot host the store; the web and later mobile builds use other adapters behind the same repository ports.

**PD-014 — A utility-process state service, with Electron main as the only broker.** *Decision:* the database is owned by an Electron `utilityProcess` (`apps/device-agent`), supervised by main with 0.5/2/8 s backoff and a degraded in-memory mode after more than three crashes in two minutes. Main forks it and posts a private `MessagePort` to the child only; renderer calls go renderer, preload, main (sender-checked and validated), then the child. *Why:* a crash or long query cannot freeze main or the renderer, and the renderer never holds a database handle or port. *Naming:* the docs call it the *state service* because "Device Agent" already names the privileged execution boundary; the two are distinct (see [System Architecture](../architecture/SYSTEM_ARCHITECTURE.md#device-state-store-service-vs-device-agent)). The privileged Device Agent's own lifecycle stayed open for 31C. *Superseded by PD-026:* the process is now the resident per-user Device Agent; the closed RPC and the renderer-never-holds-a-handle rule remain.

**PD-015 — The renderer origin is the privileged scheme `dude-app://app/`.** *Context:* the loopback static server listened on port 0, so each production launch had a new origin and the renderer lost localStorage/IndexedDB on every restart. *Decision:* serve the build in-process through a privileged custom scheme (standard, secure, fetch, CORS, stream, code cache; never `bypassCSP` or service-worker permission), with the navigation guard comparing protocol and host explicitly because the origin of a custom scheme is `'null'`. *Consequence:* a fixed origin and no listening socket. *Limit:* data written at earlier random-port origins is unrecoverable (PD-021).

**PD-016 — The collaboration transport is unchanged.** *Context:* the plan allowed that `ws://` might be blocked from a custom-scheme origin and reserved a per-session self-signed `wss://` with a pinned certificate fingerprint as a fallback. *Evidence:* a spike showed `ws://` to loopback and LAN peers, secure-context APIs, WebCrypto, storage and the sandbox CSP host-source all work from `dude-app://app/`. *Decision:* keep the existing session-code-protected `ws://` collaboration server; the pinned-`wss://` fallback is **not needed and was not built**. Revisit only if a future Chromium/Electron change blocks it.

**PD-017 — The standalone outbox is always on, coalesced and limited to an explicit journaled list.** *Decision:* every journaled change writes its record and one outbox op in the same transaction, coalesced per entity (latest upsert wins, an unsent upsert then a delete leaves no op, a delete then an upsert becomes an upsert), bounded with visible backpressure instead of dropped edits, status `unsent-standalone`. Only favorites, pipelines, user scripts, projects, workspace templates, appearance, reopen-on-restart, home layout (with notes) and usage/insights journal; the store, not the renderer, decides. *Why:* a Hub joined later must find the pending edits durable, without every other key bloating the log. *Ceiling:* nothing replays or transmits ops before 31D.

**PD-018 — A tool's `local` preference defaults to environment scope.** *Decision:* a `local` persistence policy is a preference and resolves to `environment`; `session`, `user-choice` and `none` are inputs and resolve to `local-only`; `secure-local` resolves to `device`; a manifest `settingScopes` entry overrides one key (for example to make a path-like preference `device`). *Why:* the policy already encodes whether the user considers a value a setting or content, so the default needs no per-tool edit. Classification is not consent to synchronize.

**PD-019 — Usage/insights and Home layout are environment-scoped.** *Context:* earlier planning text kept "usage/recents" local-only. *Decision (explicitly requested by the product owner):* usage/insights aggregates and the Home layout with its notes are `environment`-scoped and sync-eligible **only after explicit enrollment consent** in 31D; native recents, history, journals, crash recovery and scratch inputs stay local. *Ceiling:* aggregates only, never tool inputs or outputs; enrollment must let the user keep usage local; local analytics never become Hub telemetry. The rewritten statement is in [Data, Persistence and Synchronization](../architecture/DATA_SYNC_ARCHITECTURE.md#persistence-policy-scope-and-consent-are-separate-dimensions).

**PD-020 — LLM chat runs over sender-checked IPC.** *Decision:* the OpenAI-compatible request is made by main through `dude:llm:chat` (message and size caps, 120 s timeout, key scrubbed from errors); the loopback HTTP proxy was deleted. *Why:* a `dude-app://` renderer cannot call a loopback proxy cross-origin, and the API key should never leave main. The capability id `llm-proxy` is retained as a stable identifier but is labelled "Local LLM chat".

**PD-021 — Migration is best-effort and one-shot, and legacy-compat code is removed.** *Context:* the product owner stated there are no existing production users to protect. *Decision:* import current-origin renderer keys, IndexedDB history databases, legacy `userData` files and `secure-store.json` once, keep the moved legacy files as the untouched `legacy-import/<timestamp>/` recovery copy, and delete the compatibility layer (`storageMigrations`, `moveLocalValue`, every `migrateX`, the legacy Home panel, the bundle `homePanel`); repository codecs replace them for hydration and bundle import. *Consequence:* data from earlier random-port production origins is not recovered. The store's own schema upgrades remain fully versioned, checksummed and backed up. First-sync import/merge is still owned by 31D.

**PD-022 — There are two separate, two-step resets.** *Decision:* **Clear data** wipes rows but keeps the device identity and secrets; **Reset this device** also mints a new identity and wipes secrets. Both follow the Destructive-Action Contract (preview, then a single-use 60-second token bound to the window and a digest; no incidental triggering; `ConsequenceClass` coverage through the high-consequence gate; boundary specs). The device display name defaults to "Windows PC" and is never the hostname.

### Phase 31C implementation decisions

These decisions were taken while planning Phase 31C (Milestones 628–649, recorded 2026-10-02) and are implemented across those milestones; nothing below is claimed as shipped until the [Phase 31C roadmap entry](../delivery/ROADMAP.md#phase-31c) says so. Each is current unless a later decision supersedes it. PD-026 supersedes the open lifecycle question in PD-014.

**PD-023 — The Hub runs on Fastify with a versioned REST API.** *Decision:* Fastify serves REST under `/api/v1`. Request/response schemas are TypeBox schemas on a `@dude/contracts` hub subpath (not re-exported from the package index); clients validate with `Value.Check`. `@dude/api-client` runs over an injected transport port because portable packages may not use `fetch` or Node built-ins. *Context:* the Hub is a security-sensitive listener that must bundle into a single executable. *Alternatives considered:* NestJS (heavy, decorator metadata fights esbuild, against the dependency-minimal default); raw `node:http` (hand-rolled routing, parsing, limits and header plumbing in exactly the code that must be correct). *Consequences:* every route carries a schema; no pino transports (synchronous destination only); optional native WebSocket accelerators (`bufferutil`, `utf-8-validate`) stay external to the bundle.

**PD-024 — The Hub ships as a Node 24 single-executable application with Windows-service, Docker and foreground modes.** *Decision:* `dude-hub.exe` is an esbuild CJS bundle injected with `postject` (declared as a direct dev dependency); Angular assets ship as files in `service/web/`. On Windows it runs as a service wrapped by WinSW 2.12.0 (sha256-pinned) under the virtual account `NT SERVICE\DudeHub`. Data lives in `%ProgramData%\DUDE\Hub` (`service/`, `data/`, `storage/`, `backups/`, `config/`); pre-migration copies go in `data/pre-migration/` because `backups/` belongs to Phase 31G. A Docker/Linux image (container mode binds `0.0.0.0`, published with `-p 127.0.0.1:...`) and foreground `dude-hub run --data-dir <dir>` complete the set. *Context:* the exit gate needs a Hub that starts without Electron and survives with the UI closed. *Alternatives considered:* a Node-install prerequisite (not zero-friction); a hand-written service shim (security-sensitive plumbing); `LocalSystem` (needless privilege). *Consequences:* the service account needs explicit ACLs on its data directory; the SEA binary needs a startup self-test of `node:sqlite` and Argon2.

**PD-025 — Installation, update and uninstall of the Hub are independent of the desktop client.** *Decision:* the desktop NSIS installer offers an optional Hub checkbox (default off) that launches an embedded, separate, elevated `DUDE-Hub-Setup.exe` with its own uninstall entry, installed to `%ProgramFiles%\DUDE Hub`. A client update or uninstall never stops or removes the Hub. Hub data is kept on uninstall; the uninstaller shows the registered-device count and its purge option defaults off. `dude-hub purge` follows the [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract). Hub updates happen only through an explicit user-initiated "Update Hub" prompt (stop, pre-migration copy, replace, migrate, start) that states the downtime and affected-device count. The appx/MSIX target is dropped: MSIX virtualizes `AppData`, so a resident agent and the packaged app would see different stores. Binaries remain unsigned; SmartScreen, Smart App Control and checksums are documented. *Alternatives considered:* a single combined installer (couples client and server lifecycles); silent auto-update (restarts a user's authority without consent). *Consequences:* the desktop only enrolls and shows status; it controls the service solely through the first-run elevated hand-off and "Update Hub".

**PD-026 — The state-service process becomes the resident per-user Device Agent (supersedes the lifecycle question in PD-014).** *Decision:* `apps/device-agent` is built as a per-user SEA `dude-agent.exe`, started by a per-user logon scheduled task and ensured by the desktop; quitting the desktop detaches and does not stop it. The desktop talks to it over a named pipe whose name derives from the user SID and a hash of the store directory (Unix-socket fallback for Linux CI), with length-prefixed JSON and bytes as base64; `v8.serialize` is never used because Electron's V8 differs from Node's. The server proves itself first with an HMAC over a secret kept in an ACL'd `%LOCALAPPDATA%` file, and no events are sent before that handshake; a version handshake restarts the Agent on skew. The desktop never opens the database. The Agent holds the Ed25519 device key, DPAPI-wrapped through the native `windows-sys` helper; AI secrets stay with Electron main `safeStorage`. *PD-014 still holds where true:* the closed RPC table, and the rule that the renderer never holds a handle or channel and reaches the Agent only through sender-checked main IPC. *Superseded:* Electron-main-forked `utilityProcess` and `MessagePort` supervision, and the "unprivileged, no network" description, since the Agent now reaches the Hub (and only the Hub) and holds keys. *Ceiling:* it still never executes tools and grants no remote execution (PD-010 holds). *Consequences:* the 0.5/2/8 s backoff and the degraded banner remain for an unreachable Agent; store reset/quarantine moves into the Agent because Windows cannot rename files the Agent has open.

**PD-027 — The Hub has one owner, authenticated by an Argon2id password and recovery codes.** *Decision:* a single owner account with an Argon2id password (Node `crypto.argon2`) and 10 single-use recovery codes stored as SHA-256 hashes. No external OAuth. *Context:* the docs forbid dependence on a third-party provider and unprotected bootstrap. *Alternatives considered:* passkeys/WebAuthn and TOTP (deferred, addable later without changing the owner model); external OAuth (rejected by the architecture). *Ceiling:* one owner; identity evolution is Phase 81 and organizational identity Phase 96.

**PD-028 — Owner bootstrap requires a one-time setup token.** *Decision:* the Hub writes a one-time setup token to an ACL'd file. `dude-hub setup-token [--deliver-to <SID> --nonce <n>]` resolves the target profile from the `HKLM` `ProfileList` entry for that SID (an over-the-shoulder UAC elevation runs as a different administrator) and writes `{token, spkiSha256, port}` to a hand-off file ACL'd to that SID. The desktop first-run wizard UAC-elevates this command. *Consequences:* no unprotected bootstrap and no default credentials; the token is subject to persisted throttling and is consumed on use.

**PD-029 — Owner recovery has three paths and one explicitly client-side gate.** *Decision:* (1) recovery codes; (2) an elevated `dude-hub owner reset` through the local admin named pipe; (3) device-assisted recovery only from a device the owner explicitly marked recovery-trusted, after a desktop two-step confirm plus a Windows Hello prompt (`IUserConsentVerifierInterop` with the window handle) with a CredUI fallback. *Honest limit:* the Hello/CredUI step is a client-side UI gate that the Hub cannot verify; the Hub-side guards are the trust flag, rate limiting, audit and a realtime notice to other sessions. *Alternatives considered:* a waiting-period delay before recovery completes (declined). *Consequences:* the trust flag is off by default and revocable; device-assisted recovery is covered by a confirmation-boundary test.

**PD-030 — Browsers use cookie sessions; the Agent uses a device-bound bearer session.** *Decision:* browser sessions are server-side, in a `__Host-` cookie (HttpOnly, SameSite=Strict, Secure) with hashed IDs in SQLite, idle and absolute expiry, listable and revocable. The Agent holds an in-memory owner bearer session bound to the device key. CSRF and Fetch-Metadata checks apply by credential type: cookie sessions get them, bearer sessions do not. A device credential alone never grants owner rights. Browsers are sessions, not devices, in 31C; 31E may revisit. *Alternatives considered:* stateless JWTs (no server-side revocation); keeping the owner password on devices (see PD-031).

**PD-031 — Devices authenticate with an enrolled Ed25519 key, enrolled by pairing code.** *Decision:* each device generates an Ed25519 keypair (filling `DeviceRegistrationRequest.publicKey`; capabilities become a closed `DeviceCapability` vocabulary) and authenticates by signing a server challenge to obtain a short-lived access token stored hashed. Enrollment uses a pairing code minted by an owner session (10 minutes, single use, 5 attempts), delivered as `dude-pair:v1:<host>:<port>:<code>:<spki>` and a QR code. 31C ships register, list, last-seen, rename, revoke and unenroll; 31D adds revoked-device sync semantics and 31F verifies. A revoked key is permanent; rejoining requires re-pairing with a new key. *Alternatives considered:* typing the owner password on devices (spreads the highest-value secret); mTLS (certificate lifecycle burden, poor mobile/browser fit). *Ceiling:* registration grants no sync and no remote execution (PD-010).

**PD-032 — The Hub speaks pinned self-signed HTTPS on loopback by default.** *Decision:* on first start the Hub generates a self-signed ECDSA P-256 certificate with `node:crypto` and a small DER writer (no `node-forge`), with SANs for `127.0.0.1`, `::1`, `localhost` and the hostname. It serves HTTPS only, from the first endpoint, on `127.0.0.1:47600` by default. Clients pin the SPKI: a raw `tls.connect` pin check before any bytes at enrollment, then `ca` plus a `checkServerIdentity` pin check. LAN mode (`0.0.0.0` plus a Private-profile firewall rule) is set only by the installer checkbox or elevated `dude-hub network lan on|off`. `dude-hub tls rotate` pre-announces the next pin (dual pin with per-device acknowledgement); activation waits for every device or uses `--force`, which lists the devices that must re-pair. *Ceiling:* trusted-CA, reverse-proxy and public modes remain Phases 31E/31F.

**PD-033 — The security baseline applies from the first endpoint.** *Decision (resolves the 31C/31F timing ambiguity):* security headers; Origin, Fetch-Metadata and CSRF checks; body limits and schema validation; rate limits; persisted throttling and lockout (password, recovery code, pairing, setup token); append-only `audit_events` that never store credentials or payloads, with documented retention; and a server-side ConfirmationStore for destructive Hub actions. A local admin named pipe serves CLI commands so the CLI never opens `dude.db` while the service runs. *Consequences:* Phase 31F verifies and hardens this baseline for Internet exposure rather than retrofitting it.

**PD-034 — A minimal authenticated WebSocket is the realtime foundation.** *Decision:* `/api/v1/realtime` authenticates by credential type, negotiates protocol in a hello, derives last-seen/online from heartbeats, carries only `device-registry-changed`, `session-revoked` and `tls-next-pin` events, and disconnects on revoke. *Ceiling:* no synchronization and no Yjs; those belong to 31D and 31J.

**PD-035 — Hub web in 31C is the shared Angular app behind sign-in, with a small admin surface.** *Decision:* a new `hub` Angular configuration (`outputPath` `dist/hub-web`, base href `/`, service worker off because 31E owns Hub web caching). `HostKind` becomes `desktop | web-standalone | hub-web`. The admin surface is three hand-listed Settings sections (Environment & Hub, Devices, Security & Sessions) inside the existing Settings shell exception, plus `/hub/setup`, `/hub/sign-in` and `/hub/recover` pages as new shell exception #12. Hub-web routes require sign-in, static assets stay public, and SPA fallback never rewrites `/api/*`. Tools run locally. *Ceiling:* the full authenticated shared-state Hub web is Phase 31E.

**PD-036 — The Hub mints the canonical environment; the canonical database is a skeleton in 31C.** *Decision:* the Hub mints `environmentId` and `hubInstanceId`. A device keeps its standalone `environment_id` and records a separate `enrolledEnvironmentId`; local records are untouched until the 31D import. The canonical SQLite database (`data/dude.db`, WAL, `synchronous=FULL`) holds identity tables plus a canonical skeleton (`records` with revision and tombstone, `change_feed`, `applied_ops`) written by an atomic commit repository; there are no public record endpoints until 31D. Shared SQLite plumbing moves to a new Node-only `@dude/sqlite-store` package. *Alternatives considered:* adopting the device's environment ID (cannot be reconciled when a second device with its own ID enrolls). *Ceiling:* the Hub process is the only writer of the canonical database (PD-011 holds).

**PD-037 — One release train with negotiated protocol versions.** *Decision:* client and Hub ship together; an integer `protocolVersion` and `minClientProtocol` are negotiated in the REST hello and the WebSocket hello, and the database refuses to open under a downgrade via `minReaderVersion`. *Alternatives considered:* independent versions per component (a compatibility matrix with no current need). *Consequence:* an incompatible client is told to update rather than partially working.

### Testing, accessibility, and performance evolution

The original MVP deliberately rejected exhaustive coverage targets. The modern PRD keeps that pragmatic stance while replacing blanket exclusions with risk-based quality requirements:

- Phase 22 introduces registry/dependency/chunk/cache structural controls;
- Phase 23 introduces vectors, independent cross-checks, property tests, fuzzing, golden corpora, destructive-action tests, sandbox regressions, performance fixtures, and capability-specific release gates;
- Phase 26 shipped registry-wide pipeline parity and filesystem-adapter parity;
- [Build and Deployment](../delivery/QUALITY_AND_RELEASE.md#build-and-deployment) makes shared-core parity and desktop release verification standing build invariants;
- Phase 30 expands appearance/accessibility controls;
- Phase 92 introduces deliberate cross-browser CI at the universal-web horizon;
- Phase 94 introduces mature i18n/accessibility auditing.

The goal is stronger confidence where risk justifies it, not coverage percentages for their own sake.

## Commercialization Context

### Non-authoritative monetization sketch

A free/pro/team-style structure remains only a possible business-model sketch, not a committed roadmap requirement.

A compatible model could keep:

- **free/local:** every ordinary local-first utility and the useful local desktop core, including basic native conveniences such as drag-and-drop, Open With, context-menu actions, and deterministic transformations;
- **advanced individual:** optional advanced workflow/automation, packaging/support, or other value that does not remove formerly-local capabilities;
- **organization/self-hosted:** on-premises management, policy, support, deployment, enterprise integration, self-hosted collaboration/sync/runners, and similar organization-controlled capabilities.

Under the current [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries) boundary, a DUDE-operated hosted account/sync/collaboration/compute service is **not authorized**. Only the vendor-operated hosted-service variants retained in Phases 81–95 require a separate explicit product decision. User-owned Hub identity, synchronization and Android delivery are already planned in Phases 31A–31I; this commercial boundary does not defer them.

Two constraints are non-negotiable while the current PRD stands:

1. basic developer utilities must never be paywalled merely to force adoption of a paid tier; and
2. no formerly-local capability may be intentionally removed or crippled to manufacture subscription value.

## Reconciliation Decisions and Requirement Traceability

### Document authority and scope

This master PRD combines the supplied `DUDE_PRD(2).md` codebase baseline and `DUDE_PRD_amendment(1).md` planning document. The owner confirms delivery through Phase 31 and prioritizes the newer architecture before bulk Phase 32 expansion. The planning meeting is identified as 2026-09-30 from the owner's “yesterday” instruction; the supplied baseline contains its own dated historical records, which remain unchanged. Its age is not used to infer a repository commit or new verification date.

The newer planning direction governs conflicts about the target architecture; the baseline governs delivered implementation/history. Additions concerning migration, protocol reliability, release gates and operational safety are reconciliation specifications that make the combined requirements actionable, not claims that either source already implemented them. Nothing in this document reports a fresh codebase audit.

### Resolved conflicts

| Topic | Unified decision |
|---|---|
| Desktop canonical versus Hub canonical | Desktop is the privileged local workbench; Hub is the authority for synchronized shared state |
| Static Pages versus Hub-hosted Angular | Retain standalone Pages/PWA; add authenticated Hub web as a separate deployment mode of the shared Angular/core architecture |
| No cloud/accounts/database versus distributed environment | No vendor-operated runtime dependency; optional enrollment into a user-owned Hub with owner identity, canonical SQLite and sync |
| One Hub versus no-login standalone use | One authority per configured distributed environment; standalone local utilities do not require a Hub |
| Existing local backend versus Device Agent/Hub | Preserve native execution behind Client/Agent boundaries; introduce a separate persistent Hub service |
| SQLite versus PostgreSQL | SQLite WAL initially for personal canonical Hub; local device stores separate; PostgreSQL remains an optional future repository implementation |
| Ordinary persistence versus synchronization | Retention policy, authority/scope, sensitivity and consent are distinct; local persistence does not automatically authorize upload |
| Shared connection versus machine-local endpoint/secret | Separate logical definition from device binding and secure credential reference |
| Existing capabilities versus conceptual platform flags | Extend the closed registry vocabulary; derive availability and keep separate UI bindings, not competing metadata systems |
| End-to-end encryption versus initial sync | Initial scoped Hub-readable sync uses authenticated encrypted transport; E2EE and credential synchronization are later distinct work |
| Mobile only at Phase 91 | Initial React Native Android moves to 31H–31I; advanced mobile/iOS remains Phase 91 |
| Self-hosting only at Phase 96 | Personal Hub foundation moves to 31C–31G; organizational/on-prem maturity remains Phase 96 |
| Backup late in planning | Pull forward to 31G before declaring the distributed release complete |
| Collaboration order differs between planning summaries | Realtime foundation in 31C–31D; deeper collaboration in 31J after initial release, reusable by Phase 53 |
| Remote execution enabled by device registration | Registration is foundational for sync; privileged remote jobs remain deferred to Phase 88 |
| Linear phase order versus new priority | Preserve Phase 0–100 IDs, insert 31A–31J, allow one bounded Phase 32 validation slice, resume bulk Phase 32 after 31I |
| Planning checkmarks versus shipped status | Convert the proposed 2.0 scope into planned requirements; keep V1/Phases 1–31 completed records intact |

### Planning-document section coverage

Every numbered section of the planning document has a home below. Requirements are incorporated in the body; this table is navigation and provenance, not a substitute for the requirements.

| Source section | Subject | Master location |
|---|---|---|
| 1 | Purpose | [Purpose](../DUDE_PRD.md#purpose) |
| 2 | Executive Summary | [Executive Summary](../DUDE_PRD.md#executive-summary) |
| 3 | Architectural Principles | [Architectural Principles](../DUDE_PRD.md#architectural-principles) |
| 4 | Terminology | [Terminology](../product/PRODUCT_SPEC.md#terminology) |
| 5 | Target Architecture | [Target Architecture](../architecture/SYSTEM_ARCHITECTURE.md#target-architecture) |
| 6 | Device Roles | [Device Roles](../product/PRODUCT_SPEC.md#device-roles) |
| 7 | Multi-Device Ownership Model | [Multi-Device Ownership Model](../product/PRODUCT_SPEC.md#multi-device-ownership-model) |
| 8 | Canonical Data vs Device Data | [Canonical Data vs Device Data](../architecture/DATA_SYNC_ARCHITECTURE.md#canonical-data-vs-device-data) |
| 9 | Data Scope Model | [Data Scope Model](../architecture/DATA_SYNC_ARCHITECTURE.md#data-scope-model) |
| 10 | Settings Must Be Scope-Aware | [Settings Must Be Scope-Aware](../architecture/DATA_SYNC_ARCHITECTURE.md#settings-must-be-scope-aware) |
| 11 | DUDE Hub Architecture | [DUDE Hub Architecture](../architecture/SYSTEM_ARCHITECTURE.md#dude-hub-architecture) |
| 12 | Canonical Hub Database | [Canonical Hub Database](../architecture/DATA_SYNC_ARCHITECTURE.md#canonical-hub-database) |
| 13 | Device State Store | [Device State Store](../architecture/DATA_SYNC_ARCHITECTURE.md#device-state-store) |
| 14 | Synchronization Architecture | [Synchronization Protocol](../architecture/DATA_SYNC_ARCHITECTURE.md#synchronization-protocol) |
| 15 | Example Synchronization Flow | [Example Synchronization Flow](../architecture/DATA_SYNC_ARCHITECTURE.md#example-synchronization-flow) |
| 16 | Offline-First Behavior | [Offline-First Behavior](../product/PRODUCT_SPEC.md#offline-first-behavior) |
| 17 | Conflict Resolution | [Conflict Resolution](../architecture/DATA_SYNC_ARCHITECTURE.md#conflict-resolution) |
| 18 | Authentication and Identity | [Authentication and Identity](../architecture/SECURITY_ARCHITECTURE.md#authentication-and-identity) |
| 19 | Desktop Application Architecture | [Desktop Application Architecture](../architecture/SYSTEM_ARCHITECTURE.md#desktop-application-architecture) |
| 20 | Credentials and Secrets | [Credentials and Secrets](../architecture/SECURITY_ARCHITECTURE.md#credentials-and-secrets) |
| 21 | Angular Web Application | [Angular Web Application](../product/PRODUCT_SPEC.md#angular-web-application) |
| 22 | Internet Accessibility Without External Hosting | [Internet Accessibility Without External Hosting](../architecture/SECURITY_ARCHITECTURE.md#internet-accessibility-without-external-hosting) |
| 23 | Hub Accessibility Modes | [Hub Accessibility Modes](../architecture/SECURITY_ARCHITECTURE.md#hub-accessibility-modes) |
| 24 | Optional VPN-Only Deployment | [Optional VPN-Only Deployment](../architecture/SECURITY_ARCHITECTURE.md#optional-vpn-only-deployment) |
| 25 | React Native Mobile Application | [React Native Mobile Application](../product/PRODUCT_SPEC.md#react-native-mobile-application) |
| 26 | Platform Capability Model | [Platform Capability Model](../architecture/SYSTEM_ARCHITECTURE.md#platform-capability-model) |
| 27 | DUDE Core / Shared Logic Refactor | [DUDE Core / Shared Logic Refactor](../architecture/SYSTEM_ARCHITECTURE.md#dude-core--shared-logic-refactor) |
| 28 | Shared Contracts | [Shared Contracts](../architecture/SYSTEM_ARCHITECTURE.md#shared-contracts) |
| 29 | Remote Device Execution — Future Phase | [Future Remote Execution](../architecture/SECURITY_ARCHITECTURE.md#future-remote-execution) |
| 30 | Hub Backup and Transfer | [Hub Backup and Transfer](../architecture/DATA_SYNC_ARCHITECTURE.md#hub-backup-and-transfer) |
| 31 | Standby Hub — Later | [Standby Hub — Later](../architecture/DATA_SYNC_ARCHITECTURE.md#standby-hub--later) |
| 32 | Web and Mobile During Hub Outage | [Web and Mobile During Hub Outage](../product/PRODUCT_SPEC.md#web-and-mobile-during-hub-outage) |
| 33 | Deployment and Packaging | [Deployment and Packaging](../delivery/QUALITY_AND_RELEASE.md#deployment-and-packaging) |
| 34 | Security Boundaries | [Trust Boundaries](../architecture/SECURITY_ARCHITECTURE.md#trust-boundaries) |
| 35 | Non-Goals for the First Distributed Release | [Non-Goals for the First Distributed Release](../DUDE_PRD.md#non-goals-for-the-first-distributed-release) |
| 36 | DUDE 2.0 Release Scope — Planned, Not Delivered | [DUDE 2.0 Release Scope — Planned, Not Delivered](../DUDE_PRD.md#dude-20-release-scope--planned-not-delivered) |
| 37 | Suggested Implementation Sequence | [Roadmap Direction](../delivery/ROADMAP.md#roadmap-direction) / Phases 31A–31J and 88 |
| 38 | Relative Effort | [Roadmap Direction](../delivery/ROADMAP.md#roadmap-direction) / Relative effort |
| 39 | Architectural Invariants | [Architectural Invariants](../DUDE_PRD.md#architectural-invariants) |
| 40 | Product Positioning | [Product Positioning](../DUDE_PRD.md#product-positioning) |
| 41 | Final Recommendation | [Roadmap Direction](../delivery/ROADMAP.md#roadmap-direction) / Roadmap Sequencing Rationale |

### Preservation rule

The main PRD's numbered sections, V1 showcase, Phases 0–100 feature inventories, delivered milestones, implementation notes, UX/security/build contracts and historical appendices remain represented. Later phase titles and scheduling notes change where work is pulled forward; their detailed feature lists remain so advanced scope is not lost. Historical statements explicitly marked as such describe their date, while this master document's current requirements and reconciled roadmap govern future work.

## Original Consolidated PRD Header

The original opening metadata and consolidation note are reproduced verbatim below, from the pre-split PRD at commit `b51fd71b785aea04774ab5d6decffc1bbf366c9a` (lines 5–18). This preserves source wording that the first split condensed. Its references to the unified document and global sections describe the former layout; the [root compatibility index](../../DUDE_PRD.md#legacy-section-index) resolves those references. Current authority remains with the [master PRD](../DUDE_PRD.md).

The [content preservation audit](PRD_SPLIT_AUDIT.md) accounts for every original section and records the corrections.

**Project name:** DUDE  
**Expanded name:** Developer Utility Dashboard Engine
**Product type:** local-first developer workbench evolving into a personally owned distributed developer environment  
**Current desktop target:** Windows, Angular + Electron, GitHub Releases / prepared Microsoft Store packaging  
**Target distributed surfaces:** Windows Client/Agent; independently running user-owned Hub; Hub-served Angular web; React Native Android AAB/APK, with iOS later  
**Permanent standalone surface:** GitHub Pages / installable browser-safe PWA  
**Primary audience:** the developer building and using it first; later, other developers  
**Delivery horizon:** the original weekend framework and first 10 tools are delivered; dependency-led expansion retains the Phase 100 horizon  
**Next priority:** planned Phases 31A–31I before bulk Phase 32; collaboration depth in 31J; constrained Phase 32 interleaving permitted by §21  
**Status convention:** delivered facts are the supplied baseline; new distributed requirements are planned, not implemented claims

**Project resources:** [Repository](https://github.com/arahman200165/DUDE) · [Repository PRD location](https://github.com/arahman200165/DUDE/blob/master/DUDE_PRD.md) · [Standalone web companion](https://arahman200165.github.io/DUDE/)

This document is the unified planning reference. The separate planning amendment is fully incorporated into the relevant sections. Appendix E records the resolved conflicts and source-to-section map. Detailed historical implementation notes are deliberately retained so consolidation does not erase delivery evidence or roadmap scope.
