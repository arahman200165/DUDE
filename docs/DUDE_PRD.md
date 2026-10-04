# DUDE — Product Requirements

**Project:** DUDE — Developer Utility Dashboard Engine  
**Product:** local-first developer workbench evolving into a personally owned distributed developer environment  
**Baseline:** V1 and Phases 0–31 delivered; distributed Phases 31A–31G delivered, 31H–31J planned  
**Next priority:** complete Phases 31H–31J strictly in order before beginning Phase 32

Phase 31A (portable core and workspace extraction, Milestone 615) and Phase 31B (device identity, scoped local state and recoverable migration, Milestones 616–627) are complete; [31A](delivery/PHASE31A_ACCEPTANCE.md) and [31B](delivery/PHASE31B_ACCEPTANCE.md) acceptance evidence record the verified results, and 31B lists one owed installed-build manual pass. Phase 31C (self-hosted Hub, owner identity, device registry and resident Device Agent, Milestones 628–648) is complete with its decisions recorded in the [decision log](history/DECISION_LOG.md#phase-31c-implementation-decisions); [31C acceptance evidence](delivery/PHASE31C_ACCEPTANCE.md) records the verified results and the owed manual passes. Phase 31D (scoped synchronization, offline replay, conflict handling and the first-sync preview between desktops through the Hub, Milestones 649–662) is complete with its decisions in the [decision log](history/DECISION_LOG.md#phase-31d-implementation-decisions); [31D acceptance evidence](delivery/PHASE31D_ACCEPTANCE.md) records the verified results and the owed two-machine manual pass. Phase 31E (the Hub-served authenticated Angular web with shared state, private-mode access with a built-in local CA, trusted-certificate sources, reverse-proxy mode, endpoint diagnostics and the gated public mode, Milestones 663–682) is complete with its decisions in the [decision log](history/DECISION_LOG.md#phase-31e-implementation-decisions); [31E acceptance evidence](delivery/PHASE31E_ACCEPTANCE.md) records the verified results and the owed manual passes. Later distributed capabilities remain planned.

[Repository](https://github.com/arahman200165/DUDE) · [Standalone web companion](https://arahman200165.github.io/DUDE/) · [Decision provenance](history/DECISION_LOG.md#reconciliation-decisions-and-requirement-traceability)

This is the authoritative entry point for product direction and architectural invariants. Detailed behavior, technical contracts, acceptance gates and sequencing live in the supporting specifications. The supplied baseline's completion statements and measurements are retained as historical evidence, not a fresh implementation audit.

## Contents

- [Product Summary](#product-summary)
- [Product Vision](#product-vision)
- [Target User](#target-user)
- [Product Principles](#product-principles)
- [Product Boundaries](#product-boundaries)
- [Product Surfaces](#product-surfaces)
- [Architectural Invariants](#architectural-invariants)
- [DUDE 2.0 Scope](#dude-20-scope)
- [Current Status](#current-status)
- [Immediate Delivery Sequence](#immediate-delivery-sequence)
- [Supporting Specifications](#supporting-specifications)

## Product Summary

DUDE is a dense, colorful, local-first **developer workbench evolving into a personally owned distributed developer environment**. The delivered Phase 31 baseline is Angular/Electron desktop plus a highly capable static web/PWA companion generated from the shared core. The next release adds a self-hosted authoritative Hub, Hub-served Angular web access, synchronized installed devices, and a React Native Android client; these are planned requirements, not shipped capabilities. The Windows desktop application is now the canonical product surface because DUDE has already shipped capabilities that a browser sandbox cannot reproduce: native filesystem access, OS-level secret storage, local backend processes, system integration, collaboration infrastructure, and live networking, filesystem and Windows process/system tooling, with database tooling still ahead. The GitHub Pages build remains a permanent zero-install companion for every capability that can run safely in-browser.

Visually, DUDE is dark-first, but not monochrome or subdued. The default UI uses a dark base and a bright, bold, highly saturated accent-color system functionally — for categories, status, and structure — rather than decoratively. Since Phase 30K (Milestones 577–585), that dark theme is the default of a controlled set of first-party appearance options: Dark / Light / System themes, high contrast, accent and category palettes, color-blind-safe status colors, density presets, UI and data font preferences, and reduced motion, all generated from one shared token source. See [Appearance System](product/UX_SPEC.md#appearance-system) for the full visual direction.

The original weekend project was **not** to build 20–30 tools immediately.

The weekend project was to build the **framework that makes tools 10 through 30 cheap and safe to add later**, while shipping enough varied tools to prove that the framework is sound. That framework was built, deployed, and proven, and the product has since grown far beyond the weekend scope.

The delivered Phase 31 product is currently:

- installable as a Windows desktop application through the Electron distribution track established in Phase 8;
- distributed through GitHub Releases today, with Microsoft Store/MSIX packaging support prepared by the shipped desktop release pipeline;
- backed by a local bundled backend only where native capabilities require one;
- static-hostable on GitHub Pages as a companion web build;
- installable as a PWA;
- functional offline for local-only/shared-core tools after the required assets are available;
- local-first by default;
- capable of public APIs, user-supplied API keys, a user-configured local/self-hosted LLM endpoint reached through a desktop IPC bridge, and later explicit integrations without making remote infrastructure mandatory;
- resilient so a heavy tool cannot freeze the whole application;
- bookmarkable through clean per-tool web URLs and, on desktop, addressable through `dude://` deep links (Phase 25);
- optimized today for Windows desktop plus desktop Chromium for the web companion;
- extremely dense and utility-first;
- easy to extend without changing the application shell;
- increasingly centered on workflows, workspaces, pipelines, Smart Paste, local history, and native integrations rather than raw tool count alone;
- governed by a shared-core rule: transformation and domain logic should remain platform-neutral whenever reasonably possible so desktop, web, CLI, IDE/browser extensions, tests, SDKs, and later integrations can reuse it.

The weekend MVP shipped with **9 showcase tools** chosen to exercise different UI, state, persistence, worker, parsing, formatting, and rendering patterns, plus a 10th tool (UUID Generator / Inspector) added as a timed extension-speed proof.

## Product Vision

### Purpose

Define the architectural evolution of DUDE from a primarily local Angular/Electron utility suite into a distributed product consisting of:

- a privileged installed desktop application;
- an Internet-accessible Angular web application;
- a cloud backend with durable services and data storage (**DUDE Hub**, self-hosted on hardware owned and controlled by the user);
- a React Native mobile application distributed as Android AAB/APK, with a path to iOS.

In this PRD, **"cloud backend" does not mean a mandatory vendor-hosted cloud service**.

The target architecture is deliberately **self-hosted and personally owned end to end**.

DUDE's backend/control plane must be capable of running on hardware owned and controlled by the user. A user's own desktop, workstation, home server, or other machine may host the authoritative DUDE backend without requiring Azure, AWS, Google Cloud, DigitalOcean, Render, Supabase, Firebase, a managed database, or any other external VM/application-hosting provider.

External infrastructure may be used optionally for commodity Internet functions such as DNS registration or public TLS certificate issuance, but **DUDE must not require third-party application hosting to operate**.

The recommended product terminology is therefore:

> **DUDE Hub** = the user's self-hosted cloud/control-plane backend.

<a id="core-product-goal"></a>

Build a reusable developer utility platform where adding a new simple utility is routine instead of architectural work.

The most important outcome is not raw tool count.

The most important outcome is this:

> After the framework exists, a new simple utility whose core logic already exists should be addable in 30 minutes or less without modifying the application shell.

This makes DUDE a long-lived personal utility platform rather than a one-weekend collection of unrelated components.

### Product Positioning

The strongest product statement is:

> **DUDE is a personally owned distributed developer operating environment.**

The user's desktop supplies privileged local computation and system access.

The user's Hub supplies:

- identity;
- synchronization;
- durable shared state;
- web access;
- collaboration;
- device discovery.

The Angular client supplies zero-install browser access.

The React Native client supplies a mobile-native pocket workbench.

The shared DUDE Core prevents the project from becoming separate desktop, web, and mobile implementations.

Most importantly:

> **The user owns the machines, the backend, the database, and the data path.**

> **In self-hosted mode, nobody else is running your application backend.**

DUDE may interact with ordinary Internet infrastructure such as DNS and certificate authorities, but the product does not require somebody else's VM or managed database to exist.

## Target User



### Primary user

A software developer who repeatedly needs small transformations, inspections, conversions, formatting operations, and debugging helpers during normal development.

Examples:

- formatting JSON copied from logs;
- decoding a JWT;
- checking character or byte counts;
- testing a regular expression;
- converting timestamps;
- hashing input;
- decoding Base64;
- previewing Markdown;
- comparing two blobs of text.

### Usage pattern

The expected use pattern is short and frequent:

1. open DUDE;
2. reach the desired tool quickly;
3. paste/type data;
4. get the result immediately;
5. copy the result;
6. switch tools or leave.

The application should optimize for repeated daily use rather than onboarding first-time nontechnical users.

## Product Principles



### Framework first

The first weekend optimized for extensibility before tool count.

This ordering was validated by the actual delivery sequence: shell → tool registry → command palette → persistence policies → worker execution layer → PWA/connectivity → GitHub Pages routing/CI → showcase tools → critical tests → extension-speed proof. Each layer was built before the tools that depend on it, which is why the 10th tool ([A. Extension speed](history/DELIVERY_HISTORY.md#a-extension-speed)) could be added in under three minutes with no shell changes.

### Local first

If a capability can run entirely on the user's machine, it should. If the same capability can run safely inside a browser sandbox, the shared implementation should remain browser-capable as well.

The original rule — **“if a tool can run entirely in the browser, it should”** — still governs the web companion. The desktop-first pivot does not justify moving deterministic browser-safe work into a backend merely because Electron makes that convenient. Desktop-native services exist for capabilities the browser cannot provide: raw sockets, arbitrary/background filesystem access, processes, OS integration, local servers, secure keychain access, and similar native operations.

Network access should not be introduced merely because it is convenient. Any transmission outside the machine must be explicit in capability metadata and visible to the user.

This is also a product feature, not just an architecture choice: DUDE should make it visible in the UI when a tool is processing entirely on-device — “processed locally, your data never leaves your machine” — since this matters most for exactly the inputs users are most guarded about (JWTs, API responses, logs, configs, company data). See [Persistence Policy](architecture/DATA_SYNC_ARCHITECTURE.md#persistence-policy), [Sensitive Inputs](architecture/SECURITY_ARCHITECTURE.md#sensitive-inputs), [Security Boundaries](architecture/SECURITY_ARCHITECTURE.md#security-boundaries), and the Phase 22 metadata/security work for how this is enforced technically.

### Dense over decorative

DUDE is a working developer surface, not a marketing site.

Screen real estate should be spent on inputs, outputs, useful controls, status, and metadata.

This applies to color the same way it applies to space: the palette is bright and bold ([Appearance System](product/UX_SPEC.md#appearance-system)), but every color is carrying information — category, status, active state — never spent purely for decoration.

### Fast and predictable

Every tool should share familiar conventions where those conventions help:

- reset;
- copy;
- swap where relevant;
- import/paste;
- error display;
- output display;
- persistence behavior;
- keyboard focus;
- tool metadata.

### Explicit over magical

Persistence, API usage, sensitive-value storage, worker execution, and online requirements should be visible in the implementation and preferably declared by the tool.

### Failure should remain local

A failing tool should fail inside its own workspace.

The application shell should survive.

### Expansion is roadmap-driven

The roadmap can be broad ([Roadmap Direction](delivery/ROADMAP.md#roadmap-direction)).

Any single unit of work — a new tool, an enhancement, a framework change — should still be scoped and finished on its own terms rather than growing to cover multiple roadmap items at once.

### Depth and interconnection over raw tool count

DUDE's moat is not the number of tools it has.

As the roadmap grows into the hundreds of tools ([Roadmap Direction](delivery/ROADMAP.md#roadmap-direction)), the differentiator is meant to stay excellent UX, privacy, interoperability between tools, and depth on the tools that already exist — not simply adding more of them. Concretely: prefer enriching an existing tool (tree views, search, exports, validation, related-tool hand-offs) over shipping a shallow new one when both are on the table, and treat DUDE as a single cohesive workbench that tools connect within (see [Phase 21](history/DELIVERY_HISTORY.md#phase-21)), not an unrelated pile of pages that happen to share a shell.

### Desktop is canonical; web preserves zero-install reach

The Windows desktop application is the canonical privileged local workbench. In the target distributed environment the Hub, rather than any client, is authoritative for synchronized state. The GitHub Pages/PWA build remains a permanent, zero-install companion and should contain **every DUDE capability that can run safely inside a browser sandbox**, but web-platform constraints no longer define the ceiling of the product.

Desktop is not conceptually defined as “the web app plus a few extra permissions.” It is the primary product surface for native workflows: OS/network/filesystem/process access, drag-and-drop, system tray and global shortcuts, local servers, live database connections, native file watching, secure keychain storage, multi-window workflows, desktop automation, and later integrations that cannot be reproduced faithfully in a browser.

This still implies a strict shared-core architecture. Transformation/domain logic should live in platform-neutral modules whenever reasonably possible, with thin adapters for Angular/browser APIs, Electron/native APIs, CLI, VS Code/IDE integrations, browser extensions, tests, SDKs, and future surfaces. The desktop and web builds must not fork the same deterministic tool logic into unrelated implementations.

The web companion remains strategically important because a URL is the lowest-friction entry point into DUDE: no install, bookmarkable tool routes, PWA support, offline-safe local utilities, and easy sharing of tool locations. Phase 26 hardened that companion with selective offline caching, share links, PWA installation, and navigation-only desktop handoff.

Basic local developer utilities must never be paywalled behind the desktop app, an account, or a paid tier. They are the product's on-ramp, not an upsell surface.

## Product Boundaries

### Durable Product Boundaries

[Durable Product Boundaries](#durable-product-boundaries) now separates genuine durable principles from features that were merely premature. Desktop packaging, collaboration, multi-window workflows, snippets, secrets, extensions, and theming demonstrated that many weekend-era exclusions were really “not yet,” not “never.” The authoritative scope is therefore a smaller set of durable constraints.

These constraints survive roadmap growth unless the owner makes an explicit future PRD decision to reverse one:

1. **No silent transmission of user data.** Any feature that sends user input, files, secrets, logs, code, telemetry, or derived content off-machine must disclose that behavior and require an appropriate explicit action/opt-in.
2. **No mandatory cloud dependency for functionality that can reasonably stay local.** Deterministic utilities, local workspaces, local history, local automation, and other local-capable workflows must remain useful without a hosted account/service.
3. **No DUDE-operated hosted cloud is part of the current product direction.** Local bundled backends, LAN services, BYO/self-hosted relays, user-owned remote machines/runners, and self-hosted/on-prem infrastructure are allowed. Roadmap phases that describe optional DUDE-hosted accounts/sync/collaboration/compute are retained for completeness as a *conditional alternative horizon*, but they are not authorized while this boundary stands.
4. **No destructive or privileged operation without explicit confirmation.** Opening, importing, inspecting, or detecting data must never itself trigger destructive system changes. Mutating process/registry/service/filesystem/database/container/Kubernetes/remote-system operations require clear intent, previews/dry runs where practical, and confirmation proportional to risk.
5. **No untrusted remote code executing with DUDE/Desktop privileges.** Sandboxed user scripts and future plugins/extensions may exist, but untrusted code must be isolated/capability-scoped. Native privileges may only be granted through explicit, reviewable permission boundaries.
6. **No private credentials compiled into distributions.** Service credentials are user-supplied, locally generated, retrieved from approved local secret stores, or configured by the operator of a self-hosted deployment.
7. **Basic local developer utilities never become paywalled.** A future commercial model may charge for optional services or advanced organizational capabilities, but must not remove or artificially cripple formerly-local utility functionality to manufacture a paid tier.
8. **DUDE does not become a conventional VS Code clone or source-code-IDE-first product.** Later editor, LSP, terminal, Git, project, and code-intelligence surfaces are allowed only in service of the broader developer-workbench model. The product identity remains “give this development problem/artifact/system to DUDE,” not “rebuild VS Code feature-for-feature.”

### Non-Goals for the First Distributed Release

The first self-hosted distributed DUDE release should not require:

- Azure/AWS/GCP application hosting;
- an external VM;
- managed PostgreSQL;
- managed object storage;
- Firebase/Supabase;
- port-forwarding individual Device Agents;
- automatic multi-master Hub clustering;
- automatic failover consensus;
- CRDT synchronization for every record;
- remote desktop execution;
- porting every existing tool to mobile;
- synchronizing all secrets;
- synchronizing ephemeral utility input;
- replacing Electron;
- making every tool available on every platform.

## Product Surfaces

### Executive Summary

DUDE should evolve into a **distributed, local-first, self-hosted developer environment** rather than a conventional SaaS application.

The user may own several computers—for example:

- Main Desktop
- Second Desktop
- Laptop

—and install DUDE independently on all of them.

Those installations must **not** become three independent DUDE backends with three competing authoritative databases.

Instead:

> **A DUDE user has one logical synchronized DUDE environment containing zero or more registered devices.**

One machine is designated as the **DUDE Hub**.

The Hub hosts the authoritative shared services and data:

- Angular web application;
- application API;
- authentication;
- device registry;
- synchronization;
- realtime/WebSocket services;
- collaboration;
- durable shared data;
- backup coordination;
- future remote-execution coordination.

Every installed desktop runs:

- the DUDE Desktop UI;
- the DUDE Device Agent/Runtime;
- local tool execution;
- a local device state store/cache;
- offline synchronization support.

Therefore, three DUDE computers are not:

Three separate authoritative chains—Desktop A / Backend A / Database A, Desktop B / Backend B / Database B, and Laptop C / Backend C / Database C—are explicitly excluded.

They are:

One DUDE Environment contains one authoritative Hub. Desktop A, Desktop B, and Laptop C each connect as Client/Agent installations to that same Hub.

Each device may have its own SQLite store, but those stores have a different purpose:

> **The Hub owns canonical synchronized state. Device databases contain replicas/caches, device-specific state, local/private state, and pending offline synchronization operations.**

The number of DUDE installations must **not** increase the number of authoritative DUDE backends or canonical user databases.

The Windows desktop and standalone Pages/PWA companion are delivered. Hub-served web and React Native Android are planned; iOS and macOS/Linux desktop remain later scope. See [Product Surfaces](product/PRODUCT_SPEC.md#product-surfaces) for platform behavior.

## Architectural Invariants

### Architectural Principles

The following principles are requirements for the DUDE 2.x architecture.

#### Self-hosted by default

DUDE SHALL be capable of operating as a user-owned distributed system without requiring vendor-operated:

- application servers;
- cloud VMs;
- managed databases;
- hosted synchronization infrastructure;
- hosted object storage;
- vendor-specific realtime infrastructure.

One of the user's own machines MAY host the DUDE Hub.

#### Exactly one authoritative Hub

A DUDE environment SHALL have **exactly one authoritative Hub at a time**.

Additional devices may be Hub-capable or configured as backup/standby candidates, but multi-master database operation, automatic leader election, distributed quorum, and split-brain resolution are not initial requirements.

#### Multiple devices, one logical environment

A user may install DUDE on any number of desktops/laptops.

Every installation is a device in the same logical environment, not an independent account/backend.

#### Desktop remains privileged

Installed desktop DUDE remains the canonical environment for privileged local operations involving:

- filesystem;
- processes;
- Windows services;
- registry;
- event logs;
- ACLs;
- networking;
- Docker/containers;
- Git;
- SSH;
- databases;
- native Windows helpers;
- local AI;
- other OS-level capabilities.

#### Local-first utility execution

Browser-safe and device-safe transformation tools should execute locally whenever possible.

DUDE must not turn into a system where every:

- JSON document;
- JWT;
- source file;
- logfile;
- API response;
- config;
- packet capture;
- secret;
- clipboard item

is automatically transmitted to the Hub.

#### Offline desktop usability

A DUDE desktop/laptop must remain useful when:

- Internet access is unavailable;
- the Hub is temporarily unavailable;
- the machine is traveling;
- the Hub machine is powered down.

Local tools continue to operate, local cached data remains available, and pending synchronization operations are queued.

#### Shared core, separate presentation layers

Angular and React Native will have separate presentation layers.

They should share framework-neutral:

- domain models;
- tool engines;
- tool registry metadata;
- validation;
- contracts;
- sync models;
- API types;
- capability models.

#### No public exposure of raw desktop-native services

The privileged local Electron/native layer SHALL NOT be exposed directly to the public Internet.

Remote access must go through authenticated DUDE protocols and explicit device capabilities.

### Architectural Invariants

The following should be treated as non-negotiable unless a subsequent explicit product decision changes this PRD.

1. **A DUDE environment has one authoritative Hub at a time.**
2. **The Hub may run entirely on user-owned hardware.**
3. **No third-party application host is required for normal operation.**
4. **Multiple DUDE desktop installations do not create multiple authoritative backends.**
5. **Every desktop installation is a Client + Device Agent; Hub is an optional additional role.**
6. **Canonical synchronized state belongs to the Hub.**
7. **Device databases are caches/replicas plus device/private/offline state.**
8. **Data and settings have explicit scopes.**
9. **Sensitive utility inputs remain local by default.**
10. **The Hub never directly exposes unrestricted native machine capabilities.**
11. **Installed devices continue to provide useful local functionality while the Hub is offline.**
12. **Sync is hub-and-spoke, not device-to-device peer sync.**
13. **Browser-safe tools execute locally where possible.**
14. **Angular Web is served by the user's Hub.**
15. **React Native Mobile talks to the user's Hub.**
16. **Device registration is foundational, not merely a remote-execution feature.**
17. **Remote privileged execution is deferred and capability-gated.**
18. **Hub backup and transfer are required because the user owns the infrastructure.**
19. **Automatic multi-master Hub clustering is not an initial goal.**
20. **Framework-neutral DUDE Core packages precede large-scale mobile work.**

### Standalone Operation and Environment Enrollment

The one-authoritative-Hub invariant applies to a configured **distributed DUDE Environment**. A person may continue to use standalone DUDE without creating or reaching a Hub, registering a device, or signing in. A standalone installation is not a second authoritative server for an existing environment.

Connecting an existing installation is an explicit enrollment/migration action: create a new environment on a selected Hub or join an existing environment. Installing another Client/Agent must never silently create another Hub, replace the selected authority, or upload historical data. A Hub may have zero registered desktop devices while still serving web clients. Multiple simultaneous environments per client are not required for the first release; storage/authentication boundaries must nevertheless be keyed by environment to avoid future cross-environment leakage.

A user's own Hub is still an off-device destination for every other client. Sync setup must disclose its endpoint, selected categories and privacy implications; ownership does not waive the no-silent-transmission rule.

## DUDE 2.0 Scope

### DUDE 2.0 Release Scope — Planned, Not Delivered

A credible first usable self-hosted distributed release. The release as a whole is not delivered; `[x]` marks a line item delivered through Phase 31D, `[~]` a partial delivery (stated beside it), and `[ ]` an item not yet delivered:

```text
DUDE 2.0

Desktop
[x] existing Windows desktop application retained
[x] reusable DUDE Core packages
[x] Device Agent/runtime
[x] Device SQLite state store
[x] offline operation (desktop: durable outbox, replay after restart)

Hub
[x] self-hosted DUDE Hub
[x] runs on user-owned machine
[x] background service
[x] canonical database (identity tables and synchronized records through the sync routes)
[x] authentication (single owner)
[x] device registration
[x] synchronization service (desktop devices; Android is 31H)
[x] Angular web hosting (authenticated shared-state web, private mode and the gated Internet mode)
[x] realtime/WebSocket foundation (presence, registry and sync nudges to devices and Hub web browsers)
[x] backup/export support (Phase 31G, Milestones 700–719: passphrase-encrypted Hub backups, offline restore and manual transfer; the real second-machine pass remains owed manual verification)

Synchronization
[x] global settings
[x] favorites
[x] pipelines
[x] projects/workspaces
[x] scoped settings
[x] offline outbox/replay
[x] revision-based conflict handling

Web
[x] Angular web client served by Hub
[x] authenticated remote access (private mode)
[x] browser-safe local tool execution
[x] Internet mode and private mode (private delivered in 31E; Internet mode released behind an elevated readiness gate in Phase 31F, Milestones 683–699; a real Let's Encrypt issuance and a real off-LAN reachability pass remain owed manual verification)

Mobile
[ ] React Native Android application
[ ] AAB/APK
[ ] authentication/device registration
[ ] sync
[ ] approximately 30-50 mobile-compatible tools
[ ] offline/cache behavior where practical

Explicitly deferred
DEFERRED: remote privileged desktop execution
DEFERRED: automatic Hub failover
DEFERRED: multi-master databases
DEFERRED: mandatory externally hosted infrastructure
```

## Current Status

### Reading the Delivered Baseline and the Target

**Delivered:** V1 and Phases 1–31, including Phase 31 Milestones 593–614, plus distributed Phases 31A (Milestone 615), 31B (Milestones 616–627), 31C (Milestones 628–648), 31D (Milestones 649–662), 31E (Milestones 663–682), 31F (Milestones 683–699) and 31G (Milestones 700–719). Completion statements, historical tests, tool counts, implementation paths and measured results are retained from the supplied baseline PRD; they are not a new repository verification.

**Planned next:** a self-hosted distributed release, referred to here as **DUDE 2.0**, using Phases 31A–31I. “2.0” is a product-release scope label; implementation must deliberately align it with the existing automatic package/tag versioning before release. The workspace/package layout (31A) and the local Device State Store, device identity and scoped settings (31B) the self-hosted Hub foundation (31C) desktop synchronization (31D) the Hub-served shared-state web with private access (31E) Internet readiness (31F) and encrypted backup, restore and Hub transfer (31G) are delivered; the React Native app is not.

**Two meanings of web are made explicit:** **DUDE Web (Hub mode)** is the authenticated Angular application served by the user's Hub; **DUDE Web Companion (standalone mode)** is the existing GitHub Pages/PWA application with browser-local state and no required Hub or login. Both retain the same browser-safe engines. The standalone companion is not an externally hosted copy of the user's backend or canonical database.

**Authority is not execution location:** the Hub owns canonical synchronized records. It does not become the automatic execution host for local tools, the native-service owner for every machine, or the owner of device-private inputs.

Phase 31 closed at Milestone 614. The delivered product includes the reusable tool framework, native desktop services, pipelines, Smart Paste, workspaces, projects, history, controlled appearance, networking, filesystem and Windows troubleshooting tools. [Delivery History](history/DELIVERY_HISTORY.md#delivered-baseline-through-phase-31) retains the complete baseline statement and per-phase implementation evidence.

The local Device State Store, device identity and scoped settings shipped in Phase 31B. Phase 31C added a self-hosted Hub service (pinned self-signed HTTPS on loopback by default, optional LAN mode) with a single owner identity, a device registry with pairing and Ed25519 device credentials, an authenticated realtime WebSocket foundation, a canonical SQLite database (identity tables plus an atomic record/change-feed commit repository), a Hub-served admin web (setup, sign-in, recovery, Environment & Hub, Devices, Security & Sessions), a resident per-user Device Agent that holds the device key and Hub connection, and an optional Hub installer component. Phase 31D then synchronized settings, favorites, pipelines, projects, workspace templates, Home, usage, workspace layout and scratchpad (the last three off by default) between enrolled desktops through revision-checked Hub routes, with a first-sync preview, a durable offline outbox, three-way merge, a permanent conflict inbox, retention with snapshot rebase and Settings › Sync. Phase 31E then made the Hub web the full authenticated shared-state Angular app (a browser device row, in-browser three-way merge with an inline conflict dialog, online-only shared writes, a public-asset-only service worker, a sign-out wipe, Sync and Endpoint & Exposure settings), added a built-in local CA (default for new Hubs), configured names, certificate import and reverse-proxy mode with proxy pins, pin-only device TLS verification, per-principal rate limits and an endpoint diagnostics engine. Phase 31F (Milestones 683–699) then released Public (Internet) mode behind an elevated readiness gate and added built-in ACME, dynamic-address detection, public firewall rules and a native-listener audit, Hub-observed external reachability verification, sync-time revoked-device verification, owner step-up re-authentication with session rotation, a persisted flood guard with automatic IP blocks, owner security alerts and release builds that ignore the test knobs ([acceptance](delivery/PHASE31F_ACCEPTANCE.md)). Phase 31G (Milestones 700–719) then added passphrase-encrypted Hub backups (one `.dudebackup` file, scheduled or manual, verified before it counts), an offline staged restore that gives the restored Hub a new identity and a higher authority epoch, manual Hub transfer with a fence that retires the old Hub (and a reactivate rollback), re-attach pairing codes, a device reconnect flow that keeps local data and pending edits and ends in the first-sync preview, a rebase that never deletes an acknowledged edit the Hub regressed past, a Hub web authority gate and a view-only Settings › Backup & Transfer ([acceptance](delivery/PHASE31G_ACCEPTANCE.md)); a real second-machine transfer pass remains owed. There is no automatic failover. The Android release remains planned. A Phase 31G desktop/Hub preview does not satisfy the Android-inclusive DUDE 2.0 gate. The detailed [release definition](delivery/QUALITY_AND_RELEASE.md#dude-20-distributed-release-definition-of-done--all-planned) governs completion.

## Immediate Delivery Sequence

The required sequence is **31A → 31B → 31C → 31D → 31E → 31F → 31G → 31H → 31I → 31J → Phase 32**. Complete each phase and its exit gate before starting the next. The initial distributed release gate remains at 31I; complete 31J's collaboration depth afterward, before starting Phase 32. There is no fixed calendar commitment.

| Phase | Next deliverable |
|---|---|
| 31A | Portable core, workspaces/packages, contracts and registry |
| 31B (complete) | Device identity, scoped local state and recoverable migration |
| 31C (complete) | Self-hosted Hub, owner identity and canonical persistence |
| 31D (complete) | Durable sync, offline replay and conflict handling |
| 31E (complete) | Hub-served Angular web and private access |
| 31F (complete) | Internet readiness and security verification |
| 31G (complete) | Encrypted backup, restore and sole-authority Hub transfer |
| 31H (next) | React Native Android shell and sync |
| 31I | Initial compatible mobile tools and complete DUDE 2.0 gate |
| 31J | Deeper authorized Hub collaboration and realtime behavior |

All Phase 32 implementation waits until every phase from 31A through 31J is complete, as specified in [Strict Phase Progression](delivery/ROADMAP.md#strict-phase-progression). Remote privileged execution remains deferred to Phase 88.

## Supporting Specifications

| Document | Owns | Changes when… |
|---|---|---|
| [Product Specification](product/PRODUCT_SPEC.md) | Functional behavior, journeys, surfaces and offline expectations | User-facing capabilities change |
| [UX Specification](product/UX_SPEC.md) | Appearance, navigation, interaction and accessibility | Interaction or design changes |
| [System Architecture](architecture/SYSTEM_ARCHITECTURE.md) | Runtime, packages, registry, workers and adapters | Runtime or package architecture changes |
| [Data and Sync Architecture](architecture/DATA_SYNC_ARCHITECTURE.md) | Authority, scopes, persistence, sync, migration and recovery | Data or synchronization changes |
| [Security Architecture](architecture/SECURITY_ARCHITECTURE.md) | Trust, identity, secrets, exposure and native safety | Security boundaries change |
| [Quality and Release](delivery/QUALITY_AND_RELEASE.md) | Testing, performance, builds and acceptance | Quality or release gates change |
| [Roadmap](delivery/ROADMAP.md) | Phase identifiers, dependencies and sequencing | Delivery priorities change |
| [Delivery History](history/DELIVERY_HISTORY.md) | Shipped inventories, milestones and measured evidence | Work ships |
| [Decision Log](history/DECISION_LOG.md) | Decisions, supersession and source reconciliation | Major decisions change |

### Authority Order

1. This master PRD governs product direction and invariants.
2. Product and UX specifications govern functional and interaction behavior.
3. Architecture specifications govern technical contracts within those product boundaries.
4. Quality and Release governs acceptance.
5. Roadmap governs sequencing; a future phase does not authorize a conflicting product boundary.
6. History documents preserve provenance and do not override current requirements.

Phase and milestone identifiers remain durable. Prose uses document links and descriptive anchors; the [root compatibility index](../DUDE_PRD.md#legacy-section-index) maps former global section references.
