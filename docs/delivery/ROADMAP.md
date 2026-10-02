# DUDE Roadmap

Phase identifiers remain stable. This document owns future feature inventories, dependencies and priorities; complete delivered narratives live in Delivery History.

Read [the master PRD](../DUDE_PRD.md) first. Product direction and invariants live there; this document owns the detailed contracts in its domain.

Related: [DUDE — Product Requirements](../DUDE_PRD.md) · [Quality and Release Specification](QUALITY_AND_RELEASE.md) · [DUDE Delivery History](../history/DELIVERY_HISTORY.md) · [DUDE Product Decision Log](../history/DECISION_LOG.md).

## Contents

- [Status Legend](#status-legend)
- [Current Position](#current-position)
- [Roadmap Direction](#roadmap-direction)
- [Completed Phases](#completed-phases)
- [Post-Phase-31 Priority — Self-Hosted Distributed Foundation (Planned)](#near-term-roadmap)
- [Core Expansion Roadmap](#core-expansion-roadmap)
- [Long-Horizon Roadmap](#long-horizon-roadmap)
- [Roadmap Rule Beyond Phase 21](#roadmap-rule-beyond-phase-21)
- [Roadmap Sequencing Rationale](#roadmap-sequencing-rationale)
- [Commercialization Policy and Historical Context](#commercialization-policy-and-historical-context)
- [Domain and Category Map](#domain-and-category-map)

## Status Legend

- **Complete:** delivered in the supplied baseline; implementation evidence is historical.
- **Planned:** a requirement or future gate, not a shipped claim.
- **Conditional:** requires an explicit product-boundary decision before a conflicting hosted-service variant is authorized.

## Current Position

| Horizon | Status |
|---|---|
| Phases 0–31 | Complete; Phase 31 closed at Milestone 614 |
| Phases 31A–31J | Distributed foundation and collaboration depth, delivered in order; 31A (Milestone 615) and 31B (Milestones 616–627) complete, 31C–31J planned |
| Phase 32 | Core expansion begins only after every phase from 31A through 31J is complete |
| Phases 33–100 | Retained long-horizon scope, subject to dependencies and product boundaries |

## Roadmap Direction

The roadmap deliberately extends beyond what any single delivery phase covers.

Phase 0 was the weekend commitment; it is complete. **Phases 1–31 are also complete.** Phase 8 established the Windows desktop track, Phase 21 established the cross-tool workflow foundations, and Phase 22 hardened the platform (distributed manifests, single-sourced metadata, structural validation, generated docs, dependency boundaries, chunk/cache budgets) for the next several hundred tools. Phase 30 (30A–30L) shipped the workbench shell, discovery, insights, appearance, and verification program. Phase 31 (Milestones 593–614) shipped the Windows process/system troubleshooting tools and the second local mutation engine. The next priority is to complete Phases 31A–31J strictly in order before beginning Phase 32 tool expansion. Existing Phase 32–100 identifiers and feature inventories are retained; delivered milestones remain 593–614 for Phase 31. Milestone 615 records the Phase 31A implementation, and Phase 31A is complete.

From Phase 22 onward, the roadmap deliberately stops treating raw tool count as the primary measure of progress. Platform trust, correctness, composition, native capability, local/offline strength, automation safety, discoverability, and reuse across surfaces matter more.

## Completed Phases

| Phase | Status | Released capabilities | Detailed implementation history |
|---|---|---|---|
| Phase 0 | ✅ Complete | Framework showcase and the timed extension-speed proof. | [Phase 0](../history/DELIVERY_HISTORY.md#phase-0) |
| Phase 1 | ✅ Complete | Daily encoding, IDs, text and formatting utilities. | [Phase 1](../history/DELIVERY_HISTORY.md#phase-1) |
| Phase 2 | ✅ Complete | Structured-data converters and viewers. | [Phase 2](../history/DELIVERY_HISTORY.md#phase-2) |
| Phase 3 | ✅ Complete | Browser-safe URL, request and web helpers. | [Phase 3](../history/DELIVERY_HISTORY.md#phase-3) |
| Phase 4 | ✅ Complete | Developer workflow helpers. | [Phase 4](../history/DELIVERY_HISTORY.md#phase-4) |
| Phase 5 | ✅ Complete | Richer editors and advanced document tooling. | [Phase 5](../history/DELIVERY_HISTORY.md#phase-5) |
| Phase 6 | ✅ Complete | Sandboxed executable tools. | [Phase 6](../history/DELIVERY_HISTORY.md#phase-6) |
| Phase 7 | ✅ Complete | Remaining showcase backlog closed. | [Phase 7](../history/DELIVERY_HISTORY.md#phase-7) |
| Phase 8 | ✅ Complete | Electron packaging, native access, secure storage, AI proxy and BYO collaboration. | [Phase 8](../history/DELIVERY_HISTORY.md#phase-8) |
| Phase 9 | ✅ Complete | Structured-data inspection and transformation depth. | [Phase 9](../history/DELIVERY_HISTORY.md#phase-9) |
| Phase 10 | ✅ Complete | Text processing depth. | [Phase 10](../history/DELIVERY_HISTORY.md#phase-10) |
| Phase 11 | ✅ Complete | Encoding and numeric representation tools. | [Phase 11](../history/DELIVERY_HISTORY.md#phase-11) |
| Phase 12 | ✅ Complete | Security, cryptography and certificate inspection. | [Phase 12](../history/DELIVERY_HISTORY.md#phase-12) |
| Phase 13 | ✅ Complete | Authentication/JWT tooling. | [Phase 13](../history/DELIVERY_HISTORY.md#phase-13) |
| Phase 14 | ✅ Complete | Date/time tools. | [Phase 14](../history/DELIVERY_HISTORY.md#phase-14) |
| Phase 15 | ✅ Complete | Web/HTTP tooling. | [Phase 15](../history/DELIVERY_HISTORY.md#phase-15) |
| Phase 16 | ✅ Complete | Regex tooling. | [Phase 16](../history/DELIVERY_HISTORY.md#phase-16) |
| Phase 17 | ✅ Complete | Design, markup and media utilities. | [Phase 17](../history/DELIVERY_HISTORY.md#phase-17) |
| Phase 18 | ✅ Complete | Code generators and references. | [Phase 18](../history/DELIVERY_HISTORY.md#phase-18) |
| Phase 19 | ✅ Complete | IDs, mock data and Git/SQL/container configuration. | [Phase 19](../history/DELIVERY_HISTORY.md#phase-19) |
| Phase 20 | ✅ Complete | File and binary inspection. | [Phase 20](../history/DELIVERY_HISTORY.md#phase-20) |
| Phase 21 | ✅ Complete | Universal I/O, pipelines, scripts, Smart Paste, workspaces, sessions and history. | [Phase 21](../history/DELIVERY_HISTORY.md#phase-21) |
| Phase 22 | ✅ Complete | Distributed manifests, registry/conformance, dependency and cache hardening. | [Phase 22](../history/DELIVERY_HISTORY.md#phase-22) |
| Phase 23 | ✅ Complete | Correctness verification and high-consequence gates. | [Phase 23](../history/DELIVERY_HISTORY.md#phase-23) |
| Phase 24 | ✅ Complete | Private discovery, favorites, suggestions, Quick Run and recents. | [Phase 24](../history/DELIVERY_HISTORY.md#phase-24) |
| Phase 25 | ✅ Complete | Projects, native Home, deep links, menus, launcher and recovery. | [Phase 25](../history/DELIVERY_HISTORY.md#phase-25) |
| Phase 26 | ✅ Complete | Selective offline readiness, PWA and parity. | [Phase 26](../history/DELIVERY_HISTORY.md#phase-26) |
| Phase 27 | ✅ Complete | Native network diagnostics. | [Phase 27](../history/DELIVERY_HISTORY.md#phase-27) |
| Phase 28 | ✅ Complete | DNS, live TLS and certificate inspection. | [Phase 28](../history/DELIVERY_HISTORY.md#phase-28) |
| Phase 29 | ✅ Complete | Filesystem scans, watching and previewed mutation. | [Phase 29](../history/DELIVERY_HISTORY.md#phase-29) |
| Phase 30 | ✅ Complete | Workbench Home, Browse Tools, insights, appearance and integrated verification. | [Phase 30](../history/DELIVERY_HISTORY.md#phase-30) |
| Phase 31 | ✅ Complete | Windows process/system troubleshooting and the system mutation engine. | [Phase 31](../history/DELIVERY_HISTORY.md#phase-31) |
| Phase 31A | ✅ Complete | npm workspaces, portable core packages, registry-owned manifests, platform ports and data-scope types. | [Phase 31A acceptance](PHASE31A_ACCEPTANCE.md) |

<a id="near-term-roadmap"></a>

## Post-Phase-31 Priority — Self-Hosted Distributed Foundation (Planned)

**Decision:** complete the distributed foundation and collaboration depth in Phases **31A–31J**, strictly in order, before beginning Phase 32 tool expansion. These inserted IDs preserve all historical Phase 0–31 and future Phase 32–100 references. They are new planned phases, not additional completed Phase 31 milestones. Do not reuse shipped Milestones 593–614 or assign new milestone numbers until implementation planning does so.

The required sequence is **31A → 31B → 31C → 31D → 31E → 31F → 31G → 31H → 31I → 31J → Phase 32**. Complete each phase and its exit gate before starting the next. The first distributed release gate remains at 31I; complete 31J's collaboration depth afterward, before starting Phase 32. There is no fixed calendar commitment.

Backup/transfer is deliberately moved ahead of mobile delivery, and security controls begin with the first authenticated Hub endpoint. The planning sequence listed backup late and placed collaboration differently in its two summaries; this sequence resolves that inconsistency by making durable recovery part of the first usable release and delivering richer collaboration afterward, before Phase 32. The WebSocket/realtime foundation remains required in 31C–31D.

### Strict phase progression

- **During 31A–31J:** complete one phase at a time, including its full scope and exit gate, before moving to the next lettered phase. Maintenance, regression fixes and security fixes to shipped work remain permitted.
- **Phase 32 entry gate:** every phase from 31A through 31J must be complete before any Phase 32 implementation begins. All REST Client and request-collection work stays in Phase 32.
- **After 31J:** begin the retained Phase 32 backlog. Local listeners, raw protocols, mTLS, mutation-sensitive features and durable snippet sharing keep their own security/acceptance gates.

<a id="phase-31a"></a>

### Phase 31A — DUDE Core and Workspace Extraction (Complete)

**Depends on:** Phase 31 complete.

**Implementation status:** complete. Milestone 615 records the workspace/core extraction; the inherited dependency-audit blocker was then closed by upgrading Angular and DOMPurify and accepting one unpatched node-forge advisory under `npm run audit:prod`. See [acceptance evidence](PHASE31A_ACCEPTANCE.md). Phase 31B followed it.

- formalize monorepo/workspaces;
- extract framework-neutral tool engines;
- extract domain contracts;
- extract tool registry;
- introduce platform capability interfaces;
- create explicit data-scope types.

**Exit gate:** Portable engines/contracts/registry build without Angular/Electron imports; existing routes, IDs, web/desktop parity and release gates pass.

<a id="phase-31b"></a>

### Phase 31B — Device Identity, Scoped State and Migration (Complete)

**Depends on:** 31A.

**Implementation status:** complete. Milestones 616–626 and a gate-fix commit deliver the stable `dude-app://` renderer origin, LLM chat over IPC, `@dude/persistence`, the `apps/device-agent` SQLite Device State Store with its main-process broker, desktop state/journal and secret-reference migration, renderer hydration and scoped key/value persistence, entity repositories with a durable standalone outbox, history/network-run repositories and Settings › This Device with two-step resets; Milestone 627 closes the phase with inventory, documentation, decision records and evidence. See [acceptance evidence](PHASE31B_ACCEPTANCE.md), including the owed installed-build manual pass. No Hub, registration, replay or sync exists yet. Phase 31C is next.

- device ID and registration *model* (the registration handshake itself is 31C);
- local SQLite Device State Store;
- repository abstractions;
- settings scoping;
- local sync journal/outbox (recorded, never replayed, in this phase);
- secure credential storage.

**Exit gate:** Stable device IDs, scoped settings, repository adapters, secure secret references, recoverable migration and durable local outbox work without a Hub.

<a id="phase-31c"></a>

### Phase 31C — Self-Hosted Hub, Identity and Canonical Persistence (Planned)

**Depends on:** 31A–31B.

- self-hosted Node/NestJS or equivalent Hub service;
- canonical SQLite repository;
- migrations;
- owner authentication;
- device registry;
- API;
- Angular web hosting;
- background-service packaging.

**Exit gate:** A user-owned private Hub starts independently of Electron, supports owner bootstrap/recovery and device registration, owns SQLite WAL through APIs, and remains running with the UI closed.

<a id="phase-31d"></a>

### Phase 31D — Synchronization and Offline Reconciliation (Planned)

**Depends on:** 31B–31C.

- environment settings;
- favorites;
- projects;
- workspaces;
- pipelines;
- revision model;
- offline queue;
- conflicts;
- synchronization cursors.

**Exit gate:** Two desktop clients converge through the Hub; offline edits survive restart; revision conflicts, duplicate replay, deletes and revoked devices behave as specified in [Persistence Policy](../architecture/DATA_SYNC_ARCHITECTURE.md#persistence-policy).

<a id="phase-31e"></a>

### Phase 31E — Hub-Served Angular Web and Private Access (Planned)

**Depends on:** 31C–31D.

- authenticated Angular application served by Hub;
- browser-safe local execution;
- public/private Hub modes;
- HTTPS configuration;
- endpoint diagnostics.

**Exit gate:** Authenticated Hub web serves shared state, runs browser-safe tools locally, recovers direct routes, and preserves standalone Pages/PWA behavior. Internet mode is not released until 31F passes.

<a id="phase-31f"></a>

### Phase 31F — Internet Readiness and Security Hardening (Planned)

**Depends on:** 31C–31E; security design begins in 31C.

- TLS;
- firewall guidance;
- session security;
- brute-force protection;
- rate limits;
- audit events;
- WebSocket authentication;
- device revocation;
- dynamic address support.

**Exit gate:** TLS, session/origin/CSRF controls, authenticated WebSockets, audit, rate limits, revocation and reachable-endpoint diagnostics pass; public mode is deliberate and no Agent port is exposed.

<a id="phase-31g"></a>

### Phase 31G — Encrypted Backup, Restore and Hub Transfer (Planned)

**Depends on:** 31C–31F; backup design begins with canonical persistence.

- encrypted backup/export;
- restore;
- promote a new Hub machine;
- endpoint/device reconnection flow.

**Exit gate:** Restore a consistent encrypted backup on another owned machine, keep exactly one active authority and reconnect devices without losing pending edits or replaying stale history blindly.

<a id="phase-31h"></a>

### Phase 31H — React Native Android Shell and Sync (Planned)

**Depends on:** 31A–31G.

- login/connect-to-Hub flow;
- device registration;
- navigation/search;
- favorites/settings;
- local cache;
- shared registry;
- shared design tokens.

**Exit gate:** Android connects/authenticates/registers, uses shared registry/design tokens/API/sync contracts, isolates environment state and handles local cache/offline/session failure cleanly.

<a id="phase-31i"></a>

### Phase 31I — Initial Mobile Tool Set and DUDE 2.0 Gate (Planned)

**Depends on:** 31H.

- first 30-50 portable tools;
- mobile-native controls;
- QR/barcode/share-sheet/device utilities where appropriate.

**Exit gate:** Approximately 30–50 explicitly listed compatible tools have usable native UI and shared-engine verification; APK/AAB build/install evidence and all [DUDE 2.0 Distributed Release Definition of Done — All Planned](QUALITY_AND_RELEASE.md#dude-20-distributed-release-definition-of-done--all-planned) release checks are recorded.

<a id="phase-31j"></a>

### Phase 31J — Hub Collaboration and Realtime Depth (Planned)

**Depends on:** 31D–31I for delivery; realtime transport foundation starts in 31C.

- presence;
- Yjs where appropriate;
- realtime document updates;
- notifications/job status.

**Exit gate:** Presence, selected Yjs collaboration, realtime document updates and notifications/job-status contracts honor authorization, content consent and retention. Future privileged job execution remains deferred to Phase 88.

### Deferred stage — Remote Device Execution (Phase 88)

- authenticated Agent channels;
- capability-scoped commands;
- confirmations;
- audit;
- secure job protocol.

This preserves the planning sequence's eleventh stage as optional later work. Phase 32 local services, registered-device presence, mobile notifications and synchronization are not authorization to activate remote privileged execution.

### Foundation traceability and later-phase overlap

| Earlier planning stage | Authoritative schedule | Later roadmap ownership |
|---|---|---|
| 1. Core extraction | 31A | CLI/SDK/extensions reuse it in Phases 37–38, 56–63 and 97–98 |
| 2. Device identity/local data | 31B | Device/runtime depth remains capability-specific |
| 3. Hub foundation | 31C | Phase 81 deepens identity; Phase 96 adds organizational operations |
| 4. Sync | 31D | Phase 82 adds E2EE/extended categories; Phase 83 adds continuity depth |
| 5. Web self-hosting | 31E | Phase 92 expands browser/device compatibility |
| 6. Networking/security | 31F | Phase 86 adds enterprise security/policy |
| 7. React Native shell | 31H | Phase 91 expands mobile/iOS |
| 8. Mobile tools | 31I | Phase 91 adds remaining mobile capabilities |
| 9. Collaboration/realtime | Foundation 31C–31D; depth 31J | Phase 53 expands self-hosted/accountless collaboration; vendor-hosted Phase 84 remains conditional |
| 10. Backup/Hub transfer | Pulled forward to 31G | Later standby and organization-scale operations in Phase 96 |
| 11. Remote execution | Deferred to Phase 88 | Phases 89–90 extend remote environments/placement |

### Relative effort and planning posture

Planning estimate for one capable developer working heavily with AI assistance:

| Area | Relative effort |
|---|---:|
| Repository/package refactor | Medium |
| Core logic extraction | Large |
| Device data-scope model | Medium |
| Device SQLite integration | Medium |
| Self-hosted Hub | Large |
| Authentication | Medium |
| Canonical SQLite repository | Medium |
| Sync engine | Large |
| Offline conflict handling | Large |
| Angular Hub integration | Medium |
| Internet exposure/setup UX | Medium/Large |
| Security hardening | Large |
| React Native shell | Large |
| Mobile tool UI | Very large |
| Backup/Hub transfer | Medium |
| Remote Device Agent | Very large |
| Automatic standby/failover | Very large / deferred |

The full vision remains more like building a small distributed platform than merely adding a backend to an Angular application.

These are relative engineering-effort estimates from planning, not elapsed-time promises or evidence of completion. Re-estimate each stage after inspecting its affected code and dependencies; mobile UI and sync/conflict correctness are major workstreams even with AI assistance.

## Core Expansion Roadmap

<a id="phase-32"></a>

### Phase 32 — Local API & Server Toolkit

**Dependency and execution split:** implementation begins only after every phase from 31A through 31J is complete, including each exit gate. These are local Client/Agent tools; Hub hosting must not silently relocate REST requests, listening sockets, OAuth callbacks or other native execution onto the Hub. Collections and non-secret workspace definitions may synchronize only under declared scopes. Credentials, local endpoints, bind settings and executable paths retain explicit device/private handling. Snippet sharing may reuse authenticated Hub persistence later but remains a separately authorized durable-sharing feature with its original retention/access requirements.

Build a serious **local-first API development surface**: a lightweight Postman/webhook.site/WebSocket-client-style toolkit plus localhost servers/listeners that work without requiring a hosted DUDE account.

1. **REST Client** — request builder, collections, environment variables, request variables, secret variables, request history, authentication helpers, pre-request scripts, post-request tests, and request timing
2. **Local Mock HTTP Server** — static/dynamic responses, configurable delay, error simulation (`500`, timeout, rate limit, malformed response), route variables, and request logging
3. **Local Webhook Listener** — request inspector/history, replay, modify-and-replay, test-webhook generation, and signature verification
4. **WebSocket Client** — message history, JSON formatting, binary-message inspection, auto-reconnect, and ping/pong inspection
5. **Local Static HTTP Server** — serve a selected folder over HTTP with one click
6. **Local HTTPS Static Server**
7. **CORS Proxy**
8. **OpenAPI Live Introspection / Mock Server** — including mock-server-from-spec
9. **GraphQL Playground** — live query execution against a running endpoint
10. **Self-Hosted/BYO Snippet Sharing Service** — user-operated, never DUDE-hosted under the current [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries) boundary; unlike the ephemeral collaboration relay, snippets require durable storage, retention/expiry rules, share-token/access semantics, and deletion semantics
11. **Server-Sent Events Client**
12. **gRPC Client**
13. **gRPC-Web Client**
14. **MQTT Client**
15. **Raw TCP Client**
16. **Raw UDP Client**
17. **Request Collections**
18. **Environment / Variable Sets**
19. **Request Chaining**
20. **Test Assertions**
21. **Import Postman Collections** where practical
22. **HAR Import / Export**
23. **Authentication Profiles**
24. **mTLS Client Support**
25. **Proxy Configuration**
26. **Network Timing Breakdown**
27. **Request Comparison**
28. **Response Snapshot / Diff**
29. **Local OAuth Callback Catcher**
30. **Local Redirect Inspector**

#### Notes

Static OpenAPI/Swagger viewing, validation, diffing, and client/doc generation from an already-downloaded specification are browser-safe parsing/generation concerns. Phase 32 is specifically where **live endpoint interaction, local listening sockets, protocol clients, callback listeners, and running mock/static servers** belong.

Local servers should bind conservatively by default, clearly display bind address/port and exposure state, and require explicit user action before becoming reachable beyond loopback. Secret variables/authentication profiles inherit the secure-storage rules in [Offline Behaviour](../product/PRODUCT_SPEC.md#offline-behaviour), [API Integration Architecture](../architecture/SYSTEM_ARCHITECTURE.md#api-integration-architecture), and [Sensitive Inputs](../architecture/SECURITY_ARCHITECTURE.md#sensitive-inputs).

The snippet-sharing service follows the same self-hosted/BYO philosophy as collaboration but is **not** the same implementation or trust model as the ephemeral Yjs relay: durable snippets require persistence, deletion, retention/expiry, and access-token semantics that need their own design/security pass.

**Goal:** become a serious local-first API development surface without requiring a hosted account.

<a id="phase-33"></a>

### Phase 33 — Database Toolkit

Provide lightweight, read-leaning database browsing for development — the repeated 80% of inspection/query workflows developers need, without attempting to become a full DBA/DBeaver-class suite.

1. **PostgreSQL Explorer**
2. **SQL Server Explorer**
3. **MySQL / MariaDB Explorer**
4. **Oracle Explorer**
5. **Redis Explorer**
6. **MongoDB Explorer**
7. **Live SQLite Explorer** — connects to an actively used/locked database file, distinct from the static uploaded-file viewer in Phase 9
8. **Connection Profiles** stored through appropriate secret tiers
9. **Schema Search**
10. **Schema Diff**
11. **Table Data Diff**
12. **Query History**
13. **Saved Queries**
14. **Explain Plan Viewer**
15. **Transaction Controls**
16. **Safe Read-Only Mode**
17. **Parameterized Query Runner**
18. **CSV/JSON Export**
19. **CSV/JSON Import with preview**
20. **Database Metadata Inspector**
21. **Index Inspector**
22. **Foreign-Key Graph**
23. **Query Timing / Basic Profiling**
24. **Data Generator Integration**
25. **Database Snapshot Metadata Comparison**

#### Common explorer workflow

For relational/document database explorers where the database supports the concept: **connect → browse schemas/databases/tables/collections → inspect metadata → preview rows/documents → execute an explicit query/command → export results**.

<a id="notes-2"></a>

#### Notes

The read-only SQLite File Viewer in Phase 9 opens a user-selected `.sqlite` file as static content and requires no live database connection. Phase 33 is for **live database sessions** and connection profiles, including network/database drivers and transaction state.

SQL text-only operations — formatting, dialect conversion, CREATE TABLE generation, query explanation from pasted text, and similar deterministic transforms — remain separate browser-safe tools and should not require a live connection.

Write-capable actions must clearly distinguish read-only vs. mutable sessions. Import, DDL/DML, transaction commit/rollback, and other mutating operations require explicit user intent and should provide previews/row counts/transaction boundaries where practical.

**Goal:** provide the 80% of database inspection developers repeatedly need while deliberately avoiding becoming a full DBA suite.

<a id="phase-34"></a>

### Phase 34 — Containers & Local Orchestration

Stay lightweight: a developer diagnostics/orchestration companion that talks to explicitly configured local/connected container and Kubernetes environments rather than competing directly with Docker Desktop or a full Kubernetes management platform.

1. **Live Docker Image/Container Inspector** — size, ports, environment variables, state, and other runtime metadata from a running daemon
2. **Docker Command Builder + Execution** — execute deliberately constructed commands against the selected local/connected daemon
3. **Live Kubernetes Resource Viewer** — against a real, connected cluster
4. **kubectl Command Builder + Execution**
5. **Container Logs**
6. **Container Stats**
7. **Container Environment Inspector**
8. **Port Mapping Viewer**
9. **Volume Viewer**
10. **Network Viewer**
11. **Image Layer Explorer**
12. **Container Diff / Configuration Comparison**
13. **Compose Project Viewer**
14. **Start/Stop/Restart selected local resources**
15. **Kubernetes Pod Log Viewer**
16. **Kubernetes Events Viewer**
17. **Resource YAML → structured tree**
18. **Context/Namespace Switcher**
19. **Port-Forward Manager**
20. **Local Cluster Diagnostics**

<a id="notes-3"></a>

#### Notes

Phase 19 already covers static Dockerfile/Compose linting, formatting, validation, `docker run`↔Compose conversion, Kubernetes manifest validation/formatting/diffing, and kubeconfig inspection. Phase 34 is specifically the **live daemon/cluster** layer: querying runtime state, reading logs/stats/events, changing selected resource state, and managing port forwards/contexts.

Mutating daemon/cluster operations must display the target context/namespace/resource prominently and require explicit confirmation for destructive or state-changing actions.

**Goal:** stay a lightweight developer diagnostics companion rather than competing directly with Docker Desktop or dedicated Kubernetes platforms.

<a id="phase-35"></a>

### Phase 35 — System Diagnostics, Clipboard & OS Integration

Create the “why doesn't this work on my machine?” surface and the native conveniences that make DUDE feel like part of the operating system rather than a website contained in one window.

1. **System Information Dashboard** — OS, architecture, CPU, RAM, GPU, disks, network adapters, monitors, installed runtimes, hostname, logged-in user, uptime, and virtualization status
2. **Export Diagnostic Bundle** — one explicit action packages the selected diagnostic information for a bug/support report (the system-wide bundle; the per-process bundle already shipped in Phase 31 as Process Diagnostic Bundle, and this item builds on Phase 31's `sys-bundle` ZIP-writing code, `apps/desktop/sys-bundle.ts`)
3. **Clipboard History**
4. **Clipboard Monitor** — continuous monitoring, for example detecting/optionally offering to format copied JSON
5. **Screen Ruler**
6. **Live Pixel Color Picker** — screen-coordinate based, distinct from Phase 17's upload-image Pixel Color Picker
7. **Context-Menu Actions** — e.g. “Hash file,” “Format JSON” as new Explorer right-click entries (distinct from “Open with DUDE,” already available today via Phase 25's File Association Framework, which registers DUDE as an Explorer “Open with” candidate per file extension)
8. **Global Keyboard Shortcuts** — system-wide, not merely in-app (three fixed global hotkeys already exist and are independently rebindable: Phase 8 Stage 5's clipboard quick-actions, Phase 24's Smart Paste hotkey, and Phase 25's Quick Launcher hotkey; this item is about arbitrary user-defined global bindings beyond those three)
9. **System Tray Presence and Actions** — already shipped in Phase 8 Stage 5 (`apps/desktop/tray.ts`); nothing left here unless a later item needs new tray behavior
10. **Drag-and-Drop File Handling / “Open With” Integration** — in-window drop routing and Explorer “Open with” both already shipped (Phase 25 items 8–9); what remains is OS-shell-level drop targets (e.g. dropping a file onto DUDE's taskbar/desktop icon to launch-and-open, rather than dropping into an already-open window)
11. **Batch Processing Across Dropped Files**
12. **Multi-Window Workflows** — multiple DUDE windows/process-backed windows as genuine OS/window-management behavior, distinct from Phase 21's in-app tabs/panels
13. **Local Secrets Vault** — general-purpose local secrets management built on the `secure-local`/OS-keychain tier shipped in Phase 8 Stage 3; not a hosted secret-storage service
14. **Developer Environment Inspector** — installed Git/Node/Python/Java/.NET/Docker/PowerShell/Go/Rust versions and other relevant developer-runtime state — **✅ delivered by Phase 31 (M600)** as `runtime-detector`
15. **Runtime Version Conflict Detector** — including multiple-runtime/PATH conflicts — **✅ delivered by Phase 31 (M599–M600)** through `path-editor` (PATH Conflict Detector) and `runtime-detector`
16. **Disk Space / Mount Inspector**
17. **Monitor/DPI Inspector**
18. **Default Application Inspector**
19. **Clipboard Rules**
20. **Global Quick Transform Palette**
21. **Native Notification Center**
22. **User-configurable native action bindings**

<a id="notes-4"></a>

#### Notes

One-shot clipboard read/write — such as a tool's Copy button — already works in the web companion. Clipboard **history** and **continuous background monitoring** require native/background capability and belong here.

Saved Sessions remain a Phase 21 workspace/session-persistence capability; they are not OS/tray integration. Likewise, native file-watch automation is developed further in Phase 40 rather than being hidden inside this phase.

The Local Secrets Vault must reuse the secure credential boundary rather than inventing plaintext/localStorage persistence. Native quick actions and clipboard rules must remain explicit about whether they merely inspect/transform clipboard content or perform a system action.

**Goal:** make DUDE feel integrated into the operating system rather than contained inside a single application window.

<a id="phase-36"></a>

### Phase 36 — AI-Assisted Utilities

Phase 8 Stage 4 already shipped the provider-agnostic LLM bridge (a localhost-only proxy then, a sender-checked main-process IPC call since Phase 31B) plus AI regex generation/explanation. Phase 36 uses that established explicit AI path for interpretation/debugging tasks where an LLM materially reduces effort, without turning deterministic utilities into LLM wrappers.

1. **Stack Trace Explainer**
2. **SQL Explainer**
3. **Git Command Explainer**
4. **Cron Expression Explainer (AI-based)** — alongside the existing rule-based Cron Expression Parser / Next-Run Preview
5. **JSON Schema Explainer**
6. **Mock Data Schema Explainer**
7. **Log Analyzer**
8. **Error Diagnosis Assistant**
9. **Code Conversion Assistant**
10. **Regex Repair Assistant**
11. **Config Explanation Assistant**
12. **Dockerfile/Compose Explanation**
13. **Kubernetes Manifest Explanation**
14. **HTTP Failure Explanation**
15. **Certificate/TLS Explanation**
16. **Query Optimization Suggestions**
17. **Diff Summary**
18. **Structured Data Transformation Generator**
19. **Pipeline-from-Natural-Language Drafting**
20. **Explicit AI data-boundary disclosures** — every AI action states what context leaves the machine and which configured model/provider/runtime receives it

<a id="notes-5"></a>

#### Notes

Desktop dependency here is about the currently shipped **local LLM chat bridge/credential boundary**, not about native sockets/filesystem/process access. Where a capability can later run through Phase 69's on-device model runtime, the same AI feature should be able to stay fully local.

Non-AI deterministic/heuristic alternatives remain valuable and should coexist where they already exist: e.g. the heuristic Regex Generator in Phase 16, static Stack Trace Formatters in Phase 18, and the rule-based Cron parser.

AI actions must be user-initiated or explicitly configured, must respect the no-silent-transmission boundary, and must never silently replace a deterministic implementation that can provide an exact answer.

**Goal:** apply AI where it meaningfully reduces interpretation/debugging effort without turning every deterministic utility into an LLM wrapper.

<a id="phase-37"></a>

### Phase 37 — VS Code Integration

Ship a VS Code extension that surfaces DUDE's pure, framework-neutral transform/workflow logic directly inside the editor, reducing context switching without turning DUDE itself into a VS Code clone.

1. **Format/transform current selection**
2. **Decode/inspect selected JWT**
3. **Hash current selection/file**
4. **Generate identifiers**
5. **Open selection in DUDE**
6. **Run saved DUDE pipeline on selection**
7. **Smart Paste / Smart Selection recommendations**
8. **Sidebar DUDE tool launcher**
9. **Command Palette commands**
10. **Desktop hand-off for native-only actions**
11. **Shared-core implementation/tests** — use the same framework-free transform logic and semantic tests as the main application

<a id="notes-6"></a>

#### Notes

This is a separate distribution/integration target, not merely another Angular tool. It needs its own packaging, permissions, lifecycle, compatibility, and release design.

The architecture is supported by existing precedent: most deterministic tool logic is framework-free/unit-testable, and Phase 8 Stage 5 established `apps/web/src/shared-logic/` specifically so non-Angular runtimes can reuse transforms. Phase 22 expands that boundary, and the parity invariant in [Build and Deployment](QUALITY_AND_RELEASE.md#build-and-deployment) requires shared semantics not to fork.

**Goal:** bring DUDE's most useful deterministic transformations to where developers already spend much of their time.

<a id="phase-38"></a>

### Phase 38 — Browser Extension

Ship a browser extension for quick DUDE actions directly in browser workflows without requiring the full web application to be opened first.

1. **Selection/context-menu transformations**
2. **Clipboard quick actions**
3. **Compact popup utilities**
4. **Smart page/selection detection**
5. **Open selected data in DUDE Web**
6. **Open selected data in DUDE Desktop**
7. **URL/header/cookie inspection helpers** subject to browser permissions
8. **Saved pipeline quick actions**
9. **Explicit permissions model**
10. **Minimal-permission defaults**

<a id="notes-7"></a>

#### Notes

The browser extension is intentionally separate from the VS Code extension because their host APIs, lifecycle, packaging, permission models, and security boundaries are materially different. Their commonality should be the shared DUDE transform/workflow core, not a forced shared host implementation.

Permissions must be requested narrowly and justified by a concrete feature. Page content, headers, cookies, clipboard data, or selections must not be collected or transmitted silently.

**Goal:** reduce the friction between browser debugging and the full DUDE workbench.

<a id="phase-39"></a>

### Phase 39 — Cross-Platform Desktop

The Windows-first decision should establish the product, not permanently limit it.

1. macOS Electron build
2. Linux Electron build
3. Platform adapter layer cleanup
4. macOS keychain integration
5. Linux secret-service/keyring integration
6. Native file dialogs per platform
7. Platform-specific context menus
8. Platform-specific autostart
9. Platform-specific notifications
10. Platform-specific protocol/file associations
11. Signed macOS distribution
12. Signed Windows non-Store distribution
13. Linux packaging: AppImage/deb/rpm where practical
14. Cross-platform native CI

Goal: make “desktop-first” mean desktop generally while retaining Windows as the initial reference platform.

<a id="phase-40"></a>

### Phase 40 — Filesystem Automation & Watch Rules

1. Watched file/folder rules
2. Auto-format on safe file changes
3. Auto-validate configuration
4. Auto-run pipelines
5. Output-to-file actions
6. Debounce/coalescing
7. Conflict detection
8. Dry-run mode
9. Ignore patterns
10. Rule history
11. Desktop notifications
12. Per-rule permissions

**Phase 29 foundation and remaining scope:** Phase 29 shipped remembered-folder grants, recursive watching, event coalescing, root-level exclusions, a timeline, notifications and a previewed mutation engine. The 12 items above remain the Phase 40 roadmap for rule-driven behavior: rules still need their own triggers, debounce and ignore settings, conflict handling, dry-run review, history, notification settings and permissions. A watch event by itself does not authorize a write; Phase 40 must define how automatic actions meet [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract) or an explicitly specified standing authorization contract without silently overwriting work.

Goal: turn the file-watch infrastructure into useful automation without surprising users or overwriting work silently.

<a id="phase-41"></a>

### Phase 41 — Git Workstation

Build substantially beyond the existing read-oriented Git Repo Browser.

1. Working tree status
2. Branch browser
3. Commit graph
4. Commit search
5. File history
6. Blame viewer
7. Staging inspector
8. Structured diff/stage chunks
9. Branch comparison
10. Tag explorer
11. Remote inspector
12. Reflog viewer
13. Merge conflict workspace
14. Commit-message helper
15. Git command preview
16. Explicit execution for mutating operations
17. Repository diagnostics
18. Repository size/object analysis

Goal: make DUDE excellent at Git inspection and troubleshooting without immediately attempting to replace dedicated Git clients.

<a id="phase-42"></a>

### Phase 42 — SSH & Remote Systems

1. SSH connection profiles
2. Host-key inspection
3. SSH config editor
4. Known-hosts inspector
5. Secure terminal session
6. Remote command runner
7. SFTP file browser
8. Remote file inspector
9. Port forwarding manager
10. SSH tunnel builder
11. Remote environment inspector
12. Remote process snapshot
13. Jump-host support
14. Agent/keychain integration

Goal: extend DUDE's local troubleshooting model to machines developers explicitly connect to.

<a id="phase-43"></a>

### Phase 43 — Local Development Services Manager

1. Define local service profiles
2. Start/stop commands
3. Health checks
4. Port availability checks
5. Log capture
6. Environment-variable profiles
7. Dependency ordering
8. Restart policies
9. Workspace-linked service groups
10. Browser/open-endpoint actions
11. One-click development stack diagnostics

Goal: manage development-time services without turning DUDE into a general service supervisor.

<a id="phase-44"></a>

### Phase 44 — Package & Dependency Workbench

1. npm/package.json explorer
2. NuGet project/package explorer
3. Python/pip/pyproject explorer
4. Maven/Gradle dependency explorer
5. Cargo dependency explorer
6. Go module explorer
7. Dependency-tree visualization
8. Version conflict detection
9. Duplicate dependency detection
10. License inventory
11. Update candidate inspection
12. Lockfile diff
13. Package metadata lookup
14. Dependency-size analysis where available

Goal: make dependency troubleshooting a first-class DUDE workflow.

<a id="phase-45"></a>

### Phase 45 — Build & Test Intelligence

1. Parse common compiler output
2. Test-result viewers
3. JUnit/TRX/etc. result inspection
4. Build log summarization
5. Failure clustering
6. Flaky-test history from local imported results
7. Coverage-file viewers
8. Benchmark-result comparison
9. Build artifact inspection
10. Saved diagnostic pipelines

Goal: help developers understand build/test output rather than replacing their build systems.

<a id="phase-46"></a>

### Phase 46 — Logs & Observability Workbench

1. Large log viewer
2. Streaming local log tail
3. Multi-file log merge
4. Timestamp normalization
5. Structured log detection
6. Filtering/query language
7. Correlation-ID tracking
8. Severity visualization
9. Pattern extraction
10. Log diff
11. Timeline view
12. JSON log expansion
13. Regex extraction
14. Saved filters
15. Optional AI explanation

Goal: make DUDE useful when the problem is hidden inside thousands or millions of lines of logs.

<a id="phase-47"></a>

### Phase 47 — HTTP Debugging Proxy

1. Explicit local HTTP proxy
2. Request/response capture
3. Timing view
4. Header/body inspection
5. Search/filter
6. Replay
7. Modify and replay
8. HAR export
9. WebSocket capture where feasible
10. Local certificate setup workflow for HTTPS debugging
11. Domain allowlists
12. Session-scoped interception
13. Prominent security state while interception is enabled

Goal: provide an opt-in developer debugging proxy with much stricter safety boundaries than silently intercepting traffic.

<a id="phase-48"></a>

### Phase 48 — Advanced Database Workflows

1. Cross-database schema diff
2. Migration preview
3. Query-plan comparison
4. Data profiling
5. Referential-integrity inspection
6. Table relationship visualization
7. Sample-data generation
8. Redaction/anonymization pipeline
9. Data export workflows
10. Database health snapshot
11. Slow-query import/analyzer
12. Reusable database workspaces

Goal: extend the read-leaning database toolkit into deeper development/debugging workflows.

<a id="phase-49"></a>

### Phase 49 — Advanced Containers

1. Image vulnerability metadata integration where explicitly configured
2. Layer-size analysis
3. Build history viewer
4. Registry image metadata
5. Compose dependency graph
6. Container filesystem diff
7. Resource-usage history
8. Docker event stream
9. Container-to-process correlation
10. Saved local container dashboards

Goal: deepen diagnostics without trying to become the runtime itself.

## Long-Horizon Roadmap

<a id="phase-50"></a>

### Phase 50 — Kubernetes & Cloud-Native Workbench

1. Resource relationship graph
2. Deployment rollout viewer
3. Pod restart/error analysis
4. Events timeline
5. ConfigMap/Secret metadata inspection
6. RBAC explorer
7. Service/Ingress relationship viewer
8. Resource diff
9. Namespace health dashboard
10. Port-forward manager
11. Manifest → live-resource comparison
12. Helm values inspection
13. Kustomize preview
14. CRD explorer

Goal: make cluster debugging coherent enough that developers do not need to assemble every answer from multiple CLI invocations.

<a id="phase-51"></a>

### Phase 51 — Secrets & Credential Workbench

1. Expand Local Secrets Vault
2. Named secret collections
3. Environment-variable injection
4. Secret references in API profiles
5. Pipeline secret parameters
6. SSH key references
7. Database credential references
8. Certificate/private-key pairing
9. Clipboard timeout/auto-clear
10. Secret rotation reminders
11. Export only through explicitly encrypted mechanisms
12. No plaintext automatic synchronization

Goal: give native workflows access to credentials without normalizing unsafe plaintext storage.

<a id="phase-52"></a>

### Phase 52 — PKI & Certificate Workbench

1. Certificate/key inventory
2. Key-pair matching
3. CSR workflows
4. Certificate-chain construction
5. Trust-chain analysis
6. Local trust-store inspection
7. Certificate expiration dashboard
8. Keystore conversion
9. PKCS formats
10. SSH certificate inspection
11. mTLS profile builder
12. Certificate renewal workflow hooks
13. Self-signed local-development certificate workflow

Goal: consolidate DUDE's scattered certificate utilities into a coherent PKI troubleshooting surface.

<a id="phase-53"></a>

### Phase 53 — Collaboration 2.0

**Foundation reuse:** Phase 31J provides Hub presence/realtime/collaborative-document integration. Retain all richer collaboration scope here and the existing accountless/BYO relay path; authenticated Hub rooms and accountless relay rooms are distinct access modes. Do not replace the shipped ephemeral relay with an automatically persistent service.

1. Named accountless participants
2. Presence
3. Cursor/selection awareness
4. Collaborative pipelines
5. Collaborative scratchpads
6. Collaborative structured-data inspection
7. Session permissions
8. Read-only participants
9. Session export
10. Self-hosted relay persistence options
11. Optional end-to-end encrypted session payloads
12. Explicitly separate user-hosted relay from any later DUDE-operated service.

Goal: generalize the successful Markdown collaboration foundation into workbench-level collaboration.

<a id="phase-54"></a>

### Phase 54 — Workspace 2.0

1. Arbitrary multi-tool layouts
2. Named workspace templates
3. Linked inputs/outputs between panels
4. Shared scratch variables
5. Workspace-level files
6. Workspace command palette
7. Per-workspace pipelines
8. Per-workspace secrets references
9. Workspace export/import
10. Workspace cloning
11. Recovery snapshots
12. Project-linked workspaces

Goal: make the workspace the primary unit of serious DUDE usage rather than an individual tool page.

<a id="phase-55"></a>

### Phase 55 — Pipeline 2.0: Graph Workflows

Phase 21 intentionally shipped sequential pipelines only. This phase removes that ceiling.

1. Branching
2. Fan-out
3. Fan-in
4. Conditional steps
5. Loops with explicit bounds
6. Error branches
7. Retry policies
8. Parallel execution
9. Typed variables
10. File/directory values
11. Multi-input steps
12. Human confirmation steps
13. Native desktop steps
14. Secret parameters
15. Sub-pipelines
16. Pipeline debugging
17. Intermediate-value inspection
18. Versioning
19. Import/export

Goal: evolve pipelines from convenient transformation chains into a safe local automation engine.

<a id="phase-56"></a>

### Phase 56 — Local Plugin SDK

1. Formal plugin manifest
2. Tool registration API
3. Pipeline-step API
4. Command registration
5. Workspace panel API
6. Shared UI component API
7. Capability declarations
8. Permission declarations
9. Sandboxed plugin runtime where possible
10. Local developer mode
11. Plugin packaging
12. Compatibility/version contract
13. Plugin test harness
14. Documentation and examples

Goal: make DUDE extensible by people other than the original repository author without giving arbitrary plugins unrestricted native power.

<a id="phase-57"></a>

### Phase 57 — Signed Extension Marketplace

A major expansion of scope and no longer a permanent non-goal.

1. Extension catalog
2. Signed packages
3. Publisher identity
4. Capability/permission display
5. Version compatibility
6. Updates
7. Rollback
8. Disable/uninstall
9. Security review metadata
10. Report mechanism
11. Local sideloading for development
12. Strict distinction between sandboxed and native-capability extensions

Goal: build an ecosystem without turning remote plugin installation into arbitrary-code roulette.

<a id="phase-58"></a>

### Phase 58 — Workflow & Template Gallery

1. Share pipeline templates
2. Share workspace templates
3. Share tool presets
4. Share regex/test fixtures
5. Share request collections
6. Share mock server definitions
7. Version templates
8. Import preview
9. Required-capability disclosure
10. Fully local template files first
11. Optional hosted gallery later

Goal: let users share reusable DUDE workflows without requiring full plugins.

<a id="phase-59"></a>

### Phase 59 — Browser ↔ Desktop Handoff

1. Open web tool state in desktop
2. Open selected browser content in desktop
3. Safe ephemeral handoff tokens
4. File handoff where browser permissions allow
5. URL handoff
6. Pipeline handoff
7. Workspace-template handoff
8. Return generated result to invoking browser extension where explicitly authorized

Phase 26 already shipped navigation-only Open in Desktop links. Phase 59 owns state, file, token, result, and cross-surface workflow handoff. Goal: make web, extension, and desktop surfaces feel like one product.

<a id="phase-60"></a>

### Phase 60 — DUDE CLI

1. "dude json format"
2. "dude jwt inspect"
3. "dude hash"
4. "dude pipeline run"
5. File/stdin/stdout support
6. Structured JSON output mode
7. Shared transform logic
8. Pipeline invocation
9. Desktop handoff commands
10. Shell completion
11. Explicit exit-code contract

Goal: expose deterministic DUDE capabilities to terminals and scripts with zero duplicated transformation logic.

<a id="phase-61"></a>

### Phase 61 — Headless Automation

1. Scheduled local pipelines
2. File-triggered pipelines
3. Clipboard-triggered workflows
4. Process-exit triggers
5. Local HTTP-triggered workflows
6. Cron-like scheduling
7. Retry policies
8. Execution history
9. Desktop notifications
10. Resource limits
11. Explicit permissions per automation

Goal: make DUDE useful even when the main window is closed.

<a id="phase-62"></a>

### Phase 62 — Local SDK & Automation API

1. Versioned local API
2. Tool invocation
3. Pipeline invocation
4. Workspace opening
5. Smart detection
6. Health/status endpoint
7. Event stream
8. Capability querying
9. Permission tokens
10. SDKs beginning with TypeScript
11. API version compatibility policy

Goal: make DUDE scriptable by local developer tooling without exposing an unauthenticated general-purpose control surface.

<a id="phase-63"></a>

### Phase 63 — IDE Ecosystem

Expand beyond VS Code.

1. JetBrains integration
2. Visual Studio integration
3. Neovim integration
4. Sublime Text integration where practical
5. Shared CLI/SDK transport
6. Selection transformations
7. Smart selection
8. Pipeline execution
9. Desktop handoff
10. Project workspace handoff

Goal: make DUDE editor-agnostic.

<a id="phase-64"></a>

### Phase 64 — Source Hosting Integrations

1. GitHub repositories
2. GitLab repositories
3. Azure DevOps repositories
4. Pull-request diff handoff
5. CI log import
6. Workflow/pipeline metadata inspection
7. Issue/commit linkage
8. Release artifact inspection
9. User-supplied credentials only
10. Network activity explicitly shown

Goal: bring remote development artifacts into DUDE without making remote hosting services mandatory.

<a id="phase-65"></a>

### Phase 65 — Developer Task Context

1. Link workspace to issue/task URL
2. Attach notes
3. Attach local files by reference
4. Relevant Git branch
5. Relevant logs
6. Relevant requests
7. Saved pipeline set
8. Session timeline
9. Exportable debugging bundle

Goal: preserve debugging context across interruptions without trying to replace issue trackers.

<a id="phase-66"></a>

### Phase 66 — Monitoring & Watchers

1. Certificate expiration watches — **partly shipped in Phase 28** (the Certificate Watch List). This item is now to *generalize* that watcher (its scheduler, thresholds, notifications and tray badge) as the basis for the other watch types below, and to add the cross-cutting features (quiet hours, a notification center) rather than to rebuild certificate watching.
2. Endpoint health watches
3. Local service watches
4. File change watches
5. Port availability watches
6. Local database availability
7. Container health
8. Configurable desktop notifications
9. Quiet hours
10. Watch history
11. Local-only execution by default

**Phase 29 foundation and remaining scope:** Phase 28 shipped certificate expiration watches; Phase 29 shipped opt-in file-change watches, a folder timeline, notifications and a tray summary. The 11 items above remain in their original scope and order. Phase 66 generalizes those existing implementations into a common monitoring surface, adds the other target types, and provides cross-watch notification controls, quiet hours and history. These watches remain opt-in and active only while DUDE runs unless a later phase explicitly changes that lifecycle.

Goal: extend one-shot diagnostics into low-overhead developer monitoring, building on the Phase 28 certificate watcher.

<a id="phase-67"></a>

### Phase 67 — Unified Local Search & Index

1. Search tools
2. Search commands
3. Search pipelines
4. Search workspaces
5. Search history metadata
6. Search notes
7. Search explicitly indexed project files
8. Search Git metadata
9. Search logs
10. Search documentation
11. Permission-scoped local indexing
12. Index exclusion rules

**Phase 29 foundation and remaining scope:** Tree Search already streams content, metadata and structured queries within a user-granted tree, and DUDE already has tool discovery. The 12 items above still describe a unified search surface across DUDE data and explicitly indexed project files. Phase 67 may reuse Phase 29's walker, grants and exclusions; it must show what is indexed and let users remove it. Opening a project does not silently grant access or create an index.

Goal: make hundreds of capabilities and accumulated local context discoverable through one search model.

<a id="phase-68"></a>

### Phase 68 — Developer Knowledge Workbench

1. Local Markdown knowledge base
2. Snippet library
3. Command cookbook
4. Saved explanations
5. Architecture notes
6. Link notes to projects/tools
7. Full-text search
8. Exportable standard formats
9. Optional Git-backed storage
10. No proprietary lock-in

Goal: capture the durable knowledge produced while debugging, not just the transient transformations.

<a id="phase-69"></a>

### Phase 69 — On-Device AI

Reduce dependence on external LLM providers.

1. Local model runtime abstraction
2. Hardware capability detection
3. Download/manage local models
4. Small-model task routing
5. Offline explanations
6. Local log analysis
7. Local code explanation
8. Embeddings for local search
9. Local semantic retrieval
10. Clear model/storage/resource controls

Goal: let privacy-sensitive AI workflows remain entirely on-device where hardware makes that practical.

<a id="phase-70"></a>

### Phase 70 — AI Workflow Assistant

1. Suggest tools from intent
2. Suggest pipeline steps
3. Draft pipelines
4. Explain pipeline failures
5. Choose deterministic tools rather than generating transformations when possible
6. Ask permission before external network/native/destructive actions
7. Show proposed actions before execution
8. Prefer registered DUDE capabilities over arbitrary shell execution
9. Maintain explicit audit trail

Goal: use AI as an orchestrator over trusted deterministic tools rather than replacing trusted tools with probabilistic answers.

<a id="phase-71"></a>

### Phase 71 — Agentic Developer Workflows

1. Multi-step goal execution
2. Tool planning
3. Local file inspection
4. API/database/container diagnostics
5. Iterative validation
6. Human approval checkpoints
7. Sandboxed command execution
8. Rollback-aware operations where practical
9. Recorded execution trace
10. Workspace-scoped context

Goal: move from “assistant recommends what to do” to “assistant can safely perform a bounded debugging workflow.”

<a id="phase-72"></a>

### Phase 72 — Project Workspaces

1. Open project directory
2. Detect languages/frameworks
3. Detect Git repository
4. Detect package managers
5. Detect local services
6. Detect containers
7. Detect configuration
8. Project-specific tools
9. Project-specific pipelines
10. Project-specific notes/history
11. Project-specific secrets references
12. Saved project dashboard

Goal: make DUDE understand the working context around utilities rather than treating every invocation as isolated.

<a id="phase-73"></a>

### Phase 73 — Static Code Intelligence

1. Language-aware file inspection
2. AST explorers
3. Symbol indexes
4. Dependency graphs
5. Import analysis
6. Dead-code hints where reliable
7. Complexity inspection
8. Code search
9. Structural diff
10. Rule-driven diagnostics

Goal: expand into source-code understanding without yet becoming a full editor.

<a id="phase-74"></a>

### Phase 74 — Refactoring & Code Transformation Workbench

1. AST-based transformations
2. Bulk import changes
3. Structured rename previews
4. Config migrations
5. Framework migration helpers
6. API migration recipes
7. Codemod runner
8. Dry-run diff
9. Per-change approval
10. Pipeline integration

Goal: reuse DUDE's transformation philosophy at project scale.

<a id="phase-75"></a>

### Phase 75 — Profiling & Runtime Diagnostics

1. CPU profile viewers
2. Heap snapshot viewers
3. Chrome trace viewer
4. Node diagnostic report viewer
5. .NET diagnostic import
6. JVM diagnostic import where practical
7. Memory comparison
8. Timeline visualization
9. Performance regression comparison
10. Runtime-specific adapters

Goal: bring common profiler artifacts into the same diagnostic workbench.

<a id="phase-76"></a>

### Phase 76 — Integrated Terminal & Shell Workflows

1. Desktop terminal panel
2. Multiple shells
3. Working-directory integration
4. Command history scoped appropriately
5. Generated command preview
6. Send command from tool
7. Capture command output into tool
8. Pipeline terminal steps with explicit permissions
9. SSH terminal integration
10. Safe paste protections

Goal: reduce context switching while preserving a very explicit boundary between displayed commands and executed commands.

#### Workbench identity gate before editor/IDE-like phases

Phases 77–80 are preserved exactly as a long-horizon expansion of DUDE, but they do **not** authorize turning the product into a conventional VS Code clone. Editor/LSP/terminal/project surfaces must remain subordinate to DUDE's broader artifact/problem/workflow model and its deterministic utility core.

<a id="phase-77"></a>

### Phase 77 — Code Editor Surface

This introduces a code-editor surface under the workbench-identity gate above; it does not authorize a conventional VS Code clone.

1. Monaco-based editor
2. Multi-file tabs
3. Syntax highlighting
4. Search/replace
5. Diff editor
6. File tree
7. Tool handoffs
8. Formatter integration
9. Linter integration
10. Workspace integration

Goal: provide a real editing surface for developer-workbench workflows, while still not yet claiming to replace a full IDE.

<a id="phase-78"></a>

### Phase 78 — Language Services

1. LSP client infrastructure
2. Diagnostics
3. Hover information
4. Go-to-definition
5. References
6. Symbol search
7. Completion
8. Rename
9. Per-language service adapters
10. Project-aware configuration

Goal: establish the architecture required for editor intelligence without reimplementing language tooling.

<a id="phase-79"></a>

### Phase 79 — Development Environment Manager

1. Runtime discovery
2. Version-manager integration
3. Environment comparison
4. PATH repair assistance
5. SDK inventory
6. Toolchain health checks
7. Project runtime requirements
8. Missing dependency detection
9. Environment export
10. Reproducibility diagnostics

Goal: answer “why does this project work on one machine but not another?”

<a id="phase-80"></a>

### Phase 80 — Integrated Developer Workspace

A genuinely large change in product scope.

Combine:

1. Project workspaces
2. Code editor
3. Language services
4. Terminal
5. Git
6. Logs
7. API client
8. Databases
9. Containers
10. Pipelines
11. AI assistant
12. Diagnostics
13. Notes
14. Search
15. Multiple windows

Goal: DUDE becomes a developer workbench broad enough to perform substantial engineering tasks end-to-end, while retaining the utility-first design that differentiates it from conventional IDEs.

#### Conditional hosted-cloud / account horizon gate

Only **DUDE-operated vendor-hosted variants** in this horizon are conditional and blocked by [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries). User-owned identity, device registration, canonical persistence, sync, web access and Android mobile are now near-term requirements in Phases 31A–31I. The retained phase inventories below describe additional maturity or deployment variants; an item already delivered in the foundation is reused and is not implemented a second time. Self-hosted teams, enterprise policy and user-owned remote execution remain compatible with the product boundary, subject to their own delivery gates.

<a id="phase-81"></a>

### Phase 81 — Identity Maturity and Optional Account Variants

**Remaining scope:** identity and recovery maturity beyond Phase 31C. Optional vendor-hosted account infrastructure is still blocked; basic local tools require no login.

Owner identity/device registration first arrive in Phase 31C. This phase deepens that foundation; the historical list below remains the continuing acceptance contract, not a second identity implementation.

1. DUDE remains fully usable locally without login.
2. Account creation is optional.
3. Device identity
4. Session management
5. Recovery strategy
6. No account requirement for basic tools
7. Local-only mode remains first-class

Goal: create the minimum identity layer needed for optional cross-device services without converting DUDE into an account-first SaaS product.

<a id="phase-82"></a>

### Phase 82 — End-to-End Encrypted Sync

**Remaining scope:** client-side/end-to-end encryption, extended data categories and controls. Phase 31D already supplies scoped revision-based Hub sync. TLS transport encryption in that foundation must not be called end-to-end encrypted storage; secret sync remains separate and deferred.

1. Preferences
2. Themes
3. Favorites
4. Pipelines
5. Workspace templates
6. Notes
7. Snippets
8. Selected history
9. Explicitly selected project metadata
10. Client-side encryption
11. Per-category sync controls
12. Conflict resolution
13. Export/delete capability

Goal: enable multi-device continuity while preserving DUDE's privacy model as far as technically possible.

<a id="phase-83"></a>

### Phase 83 — Advanced Cross-Device Workspace Continuity

**Remaining scope:** deeper resume/layout portability, missing-file handling, capability adaptation and handoff. Foundation favorites/settings/pipelines/projects/workspaces and registered-device state reuse Phases 31B–31I.

1. Resume workspace on another device
2. Synced layouts
3. Synced pipeline definitions
4. Synced project references where meaningful
5. Missing-file handling
6. Platform-capability adaptation
7. Desktop/web handoff
8. Device presence

Goal: allow the workbench to follow the developer without pretending every device exposes identical capabilities.

<a id="phase-84"></a>

### Phase 84 — Hosted Collaboration Service

**Hosting boundary:** this phase refers to a potential vendor-operated collaboration service and remains conditional. User-owned Hub collaboration is already allocated to Phase 31J and further Phase 53 work.

Only after the self-hosted collaboration model has matured.

1. Hosted rooms
2. Optional accounts
3. End-to-end encrypted documents where practical
4. Presence
5. Session permissions
6. Expiring rooms
7. Shared workspaces
8. Shared pipelines
9. Explicit retention controls
10. Self-hosted relay remains supported

Goal: remove infrastructure friction for collaboration without taking away local/BYO deployment.

<a id="phase-85"></a>

### Phase 85 — Teams & Organizations

1. Organizations
2. Team workspaces
3. Shared templates
4. Shared pipeline libraries
5. Shared extension allowlists
6. Shared environment definitions
7. Roles
8. Audit events
9. Project collections
10. Administrative policies

Goal: support groups that want DUDE as shared developer infrastructure.

<a id="phase-86"></a>

### Phase 86 — Enterprise Security & Policy

1. SSO/OIDC/SAML
2. Managed configuration
3. Extension allow/block policy
4. Network integration policy
5. Local AI/provider policy
6. Data retention controls
7. Audit logging
8. Secret-storage integrations
9. Proxy configuration
10. Offline/air-gapped mode
11. Signed deployment artifacts
12. Administrative update rings

Goal: make organizational adoption possible without weakening the standalone local product.

<a id="phase-87"></a>

### Phase 87 — Hosted Extension Ecosystem

1. Publisher portal
2. Signing infrastructure
3. Automated security scanning
4. Compatibility testing
5. Reviews/ratings if useful
6. Version channels
7. Private organization extensions
8. Paid extension support if ever appropriate
9. Revocation
10. Emergency disable mechanism

Goal: mature the plugin marketplace into trustworthy infrastructure.

<a id="phase-88"></a>

### Phase 88 — Secure Remote Execution

**Deferred foundation extension:** this is the home of the planning sequence’s optional remote-device-execution stage. It is not a prerequisite for the first distributed release or Phase 32. Before implementation, satisfy [Future Remote Execution](../architecture/SECURITY_ARCHITECTURE.md#future-remote-execution) and [Security Boundaries](../architecture/SECURITY_ARCHITECTURE.md#security-boundaries), including established outbound authenticated Agent channels, per-device/action authorization, replay protection, confirmation, audit, revocation and least privilege. A remote request must never bypass the existing mutation engines.

1. User-owned remote runners
2. Sandboxed execution
3. Capability-limited jobs
4. Ephemeral environments
5. Uploaded-input controls
6. Secret injection
7. Artifact return
8. Resource limits
9. Execution logs
10. Local approval

Goal: permit workflows that need more compute or a different environment without assuming DUDE should silently ship data to a general cloud backend.

<a id="phase-89"></a>

### Phase 89 — Remote Development Workspaces

1. Connect to remote machine/project
2. Remote filesystem adapter
3. Remote terminal
4. Remote language services
5. Remote tool execution
6. Remote containers
7. Remote database access
8. Remote logs
9. Local UI / remote computation separation
10. Reconnect/session recovery

Goal: allow the desktop workbench to operate against explicit user-controlled remote environments.

<a id="phase-90"></a>

### Phase 90 — Hybrid Local/Cloud Execution Planner

**Hosting boundary:** user-owned Hub/runner placement is compatible with this PRD. Vendor-hosted execution remains blocked without a new explicit product decision.

1. Capability-aware execution
2. Local-by-default placement
3. User-owned remote runner support
4. Optional hosted execution
5. Privacy labels
6. Cost/resource labels
7. Explicit data movement visualization
8. Offline fallback
9. Per-workflow placement policies
10. Reproducible execution metadata

Goal: choose where work runs without obscuring where user data goes.

<a id="phase-91"></a>

### Phase 91 — Mobile Depth, Continuity and iOS Expansion

**Remaining scope:** the React Native Android shell, registration/sync and approximately 30–50 compatible tools move to Phases 31H–31I. This phase deepens mobile continuity, native integrations, safe pipeline UX and notifications, and may deliver iOS. Approving a privileged remote action remains blocked until Phase 88’s execution/security gate, even if the mobile UI exists earlier.

Not a mobile-first redesign of every tool.

1. View synced notes
2. View monitoring alerts
3. Inspect simple data
4. Run safe pipelines
5. Approve pending actions
6. Receive collaboration notifications
7. Scan QR/barcodes into a desktop workspace
8. Secure device handoff

Goal: make mobile useful as a companion without pretending a phone is the ideal interface for the full DUDE workstation.

<a id="phase-92"></a>

### Phase 92 — Universal Web Platform

At this horizon, browser compatibility can become a deliberate product investment.

1. Firefox parity
2. Safari parity
3. Responsive tablet layout
4. Better touch interactions
5. Mobile web companion
6. Web capability fallbacks
7. Broader accessibility testing
8. Cross-browser CI matrix

Goal: extend the zero-install companion well beyond its original Chromium-first constraint.

<a id="phase-93"></a>

### Phase 93 — Privacy-Preserving Product Insights

Telemetry remains opt-in rather than assumed.

1. Explicit opt-in diagnostics
2. Crash reports
3. Performance metrics
4. Anonymous feature-use counters
5. Local preview of exactly what will be sent
6. No user payload collection
7. Disable permanently
8. Enterprise-disable policy
9. Separate operational metrics from product analytics

Goal: learn where the product fails without undermining the privacy posture that made DUDE attractive.

<a id="phase-94"></a>

### Phase 94 — Internationalization & Accessibility Maturity

The original permanent i18n exclusion is finally revisited at a very distant horizon.

1. Externalized UI strings
2. Locale-aware formatting
3. Initial translated UI
4. RTL capability
5. WCAG-focused audit
6. Screen-reader regression testing
7. Keyboard-navigation test suite
8. High-contrast validation
9. Accessible charts/visualizations
10. Accessibility documentation

Goal: make DUDE genuinely usable by a broader global developer population.

<a id="phase-95"></a>

### Phase 95 — Sustainable Commercial Model

Only after product value clearly justifies it.

1. Local utilities remain free.
2. Desktop core remains useful without subscription.
3. Optional paid hosted services
4. Optional team features
5. Optional enterprise management
6. Possibly paid hosted compute
7. Possibly paid collaboration/storage
8. Transparent limits
9. No privacy-hostile advertising model
10. No artificial removal of formerly-local capabilities to manufacture a paid tier

Goal: fund long-term development without damaging the local-first product.

<a id="phase-96"></a>

### Phase 96 — Organizational Self-Hosted / On-Premises DUDE Platform

**Remaining scope:** personal self-hosting, canonical SQLite, basic sync, web hosting and backup/transfer move to Phases 31C–31G; this phase scales those foundations for organizations/on-prem deployments, identity integrations, mirrors, policy, air-gapped operations and controlled standby support. No personal user must wait until Phase 96 to own and run a Hub.

1. Self-hosted sync
2. Self-hosted collaboration
3. Self-hosted marketplace mirror
4. Self-hosted update channel
5. Self-hosted remote runners
6. Organization identity integration
7. Air-gapped installation
8. Offline extension bundles
9. Administrative policies
10. Backup/restore

Goal: let organizations operate the complete DUDE platform under their own infrastructure.

<a id="phase-97"></a>

### Phase 97 — Public DUDE Platform SDK

1. Stable transformation SDK
2. Tool SDK
3. Pipeline SDK
4. Workspace SDK
5. Plugin SDK
6. Automation SDK
7. CLI protocol
8. Local service protocol
9. Remote-runner protocol
10. Versioned public documentation
11. Compatibility guarantees

Goal: formally transform internal seams that proved useful into supported public platform contracts.

<a id="phase-98"></a>

### Phase 98 — Third-Party DUDE Applications

1. Build standalone apps using DUDE core
2. Embed DUDE tool surfaces
3. Embed pipeline runtime
4. Custom enterprise distributions
5. Domain-specific DUDE workbenches
6. Branded/self-hosted deployments
7. Shared component packages
8. Shared transform packages

Goal: let DUDE's architecture become infrastructure other software can build upon rather than only an application.

<a id="phase-99"></a>

### Phase 99 — Federated Developer Workbench Ecosystem

1. Multiple DUDE-compatible runtimes
2. Discoverable capability providers
3. User-owned remote execution nodes
4. Organization tool registries
5. Portable workspace definitions
6. Portable pipelines
7. Portable plugin manifests
8. Cross-instance handoff
9. Standardized capability/security metadata
10. Local, self-hosted, and hosted installations interoperating where explicitly authorized

Goal: make a DUDE workflow portable across machines, organizations, and execution environments without requiring one central service to own the entire ecosystem.

<a id="phase-100"></a>

### Phase 100 — DUDE Developer Operating Environment

Extremely beyond current scope. Not a commitment, schedule, or near-term architectural requirement.

At this point DUDE is no longer adequately described as a developer utility dashboard. It has become a programmable developer operating environment built around the principles established by the original weekend project: local-first execution, explicit capabilities, reusable transformations, dense interfaces, interoperability, failure isolation, and tools that compose rather than live as isolated pages.

Potential scope:

1. Utilities
2. Workspaces
3. Code editing
4. Language services
5. Terminals
6. Git/source control
7. API development
8. Databases
9. Containers
10. Kubernetes
11. Local and remote environments
12. Networking
13. System diagnostics
14. Filesystem automation
15. Secrets
16. Collaboration
17. Knowledge management
18. Pipelines
19. Extensions
20. CLI/API/SDK surfaces
21. Local AI
22. Agentic workflows
23. Remote runners
24. Optional encrypted sync
25. Team/enterprise capabilities
26. Self-hosted infrastructure
27. A third-party extension/application ecosystem
28. Portable developer workflows capable of moving between desktop, browser, terminal, editor, and user-controlled remote infrastructure.

The defining experience should be:

«Give DUDE data, code, a file, a directory, a URL, a service, a repository, a database, a container, a machine, or a development problem. DUDE identifies what it is, exposes the right deterministic tools, connects those tools into a reusable workflow, and—only with explicit permission—can carry that workflow through local or remote systems.»

Goal: evolve the original “developer utility deck” into a cohesive developer environment without losing the speed, privacy, explicitness, and composability that justified building DUDE in the first place.
## Roadmap Rule Beyond Phase 21

From Phase 22 onward, raw tool count is not itself a success metric.

Every phase should be evaluated against one or more of:

- greater correctness or trust;
- deeper workflows;
- better composition between existing capabilities;
- native capability that the web companion cannot provide;
- less repeated developer context switching;
- stronger local/offline capability;
- more reusable platform infrastructure;
- safer automation;
- improved discoverability;
- extension of DUDE into another developer surface without duplicating core logic.

A phase that adds five deeply-integrated capabilities may therefore be more valuable than one that adds fifty isolated tools.

The GitHub Pages build remains important throughout this roadmap, but from Phase 22 forward the product hierarchy is explicit:

«DUDE Desktop is the canonical privileged local workbench. The user-owned Hub is authoritative for synchronized environment state. Hub-served Angular web and the standalone Pages/PWA companion provide browser-safe access in their respective modes; React Native provides mobile-native access. Shared capabilities use the same framework-neutral engines wherever the platform allows it.»

## Roadmap Sequencing Rationale

The progression is deliberate. Phases 22–26 slow raw feature accumulation to decompose registry/metadata debt, strengthen correctness and release confidence, improve discovery, mature the desktop shell, and harden the web companion before DUDE adds significantly more native power.

Phases 27–31 delivered the native/workbench expansion. The inserted Phases 31A–31J establish the distributed architecture and collaboration depth strictly in order, completing every phase and its exit gate before Phase 32 begins. Phases 32–38 then resume the core expansion. Their authoritative text is intentionally self-contained: each phase states the static/browser-safe capabilities it complements, the live/native boundary it crosses, the relevant safety rules, and the full feature scope. No phase in this range depends on an obsolete numbering scheme or an archived roadmap definition to explain what it means.

The longer progression remains: 39–55 deepen the interconnected workbench; 56–68 turn DUDE into an extensible automation platform; 69–80 move into AI/project/IDE-adjacent territory under the workbench-identity gate; 81–96 retain advanced identity/encryption/continuity, team, enterprise, mobile and commercial depth, with only vendor-hosted variants blocked behind the explicit product boundary; and 97–100 describe DUDE as a platform/ecosystem.

Phase 100 provides the intentionally extreme long-horizon endpoint without requiring distant platform scope in the immediate Phase 31A–31J foundation and collaboration work.

### Desktop-platform continuity

The remaining desktop-platform work is explicitly assigned within the current roadmap rather than left in an unnumbered backlog:

- macOS/Linux desktop builds, platform keychains, native packaging, and signed non-Store Windows distribution — **Phase 39**;
- file-watch-driven automation and safe write workflows — **Phase 40** (read-only auto-rescan shipped in Phase 29);
- named/accountless collaboration and richer self-hosted relay behavior — **Phase 53**;
- broader local/on-device model support and AI routing — **Phases 69–71**.

## Commercialization Policy and Historical Context

Basic local utilities remain free under [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries). Phase 95 contains the commercial horizon, but under the current no-DUDE-hosted-cloud direction only local, self-hosted, on-premises, support, packaging, or other non-hosted commercial models are presently compatible without another explicit product decision. No future business model may remove formerly-local functionality merely to manufacture a subscription.

[Commercialization Context](../history/DECISION_LOG.md#commercialization-context) records the non-authoritative monetization sketch without changing these standing boundaries.

### Distributed sequencing rationale and end state

The critical milestone is to **separate canonical environment state from device execution and local state**, not merely add a backend. Extract DUDE Core; introduce explicit scopes and Device Stores; build Hub authentication, canonical persistence, sync, registry, web and realtime; connect multiple desktops; harden private/Internet access; prove backup and Hub transfer; deliver native Android; deepen collaboration; and only later consider secure remote execution.

Main Desktop, Second Desktop, Laptop and Phone should feel like one environment while retaining privileged local execution, offline capability, synchronized selected state, Internet browser access, mobile access and user ownership of server/database. No Azure, AWS or other external application-hosting provider becomes mandatory. This positioning does not authorize the full Phase 100 vision for the first distributed release.

## Domain and Category Map

The registry taxonomy remains closed at eight categories. Roadmap domains do not introduce new category values; consult this map and the actual tool’s purpose before choosing metadata.

| Registry category | Examples of domain ownership |
|---|---|
| Data | Structured formats, serialization and data transformation |
| Text | Text analysis, normalization and comparison |
| Encoding | Encodings, numeric representations and color conversion |
| Security | Authentication, cryptography, certificates and secrets |
| Date & Time | Timestamps, calendars, time zones and schedules |
| Web | URLs, HTTP and browser-safe web utilities |
| Developer | Code, native networking, filesystem and Windows troubleshooting |
| Documents | Markdown, rich text, markup previews and image/document workflows |

[Tool Categories](../architecture/SYSTEM_ARCHITECTURE.md#tool-categories) defines registry behavior. Phase inventories above and in Delivery History retain individual tool requirements.
