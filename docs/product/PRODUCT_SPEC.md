# DUDE Product Specification

This specification describes expected behavior across delivered standalone DUDE and the planned user-owned distributed environment. Planned Hub/mobile requirements do not claim implementation.

Read [the master PRD](../DUDE_PRD.md) first. Product direction and invariants live there; this document owns the detailed contracts in its domain.

Related: [DUDE UX Specification](UX_SPEC.md) · [DUDE System Architecture](../architecture/SYSTEM_ARCHITECTURE.md) · [Data, Persistence and Synchronization](../architecture/DATA_SYNC_ARCHITECTURE.md) · [DUDE Security Architecture](../architecture/SECURITY_ARCHITECTURE.md) · [DUDE Roadmap](../delivery/ROADMAP.md).

## Contents

- [Product Surfaces](#product-surfaces)
- [Terminology](#terminology)
- [Multi-Device Ownership Model](#multi-device-ownership-model)
- [Principal user journeys and failure states](#principal-user-journeys-and-failure-states)
- [Functional Capability Model](#functional-capability-model)
- [Tools and Tool Families](#tools-and-tool-families)
- [Workspaces](#workspaces)
- [Pipelines](#pipelines)
- [Projects](#projects)
- [Search and Command Palette](#search-and-command-palette)
- [Offline Behaviour](#offline-behaviour)
- [Large Inputs](#large-inputs)
- [Scope Evolution and Deferred Capabilities](#scope-evolution-and-deferred-capabilities)
- [Deferred Definition](#deferred-definition)

## Product Surfaces

### Primary Supported Platform

- **Windows desktop application via Electron** — the canonical DUDE product surface.
- Distribution through the shipped GitHub Releases installer/update path, with MSIX/Microsoft Store packaging support as established by Phase 8 Stage 8.
- Local/offline operation where the selected capability permits it.
- Native capability through sandboxed preload/IPC boundaries rather than direct Node access in the renderer.

Acceptance for new native features is primarily against the Windows desktop product unless a phase explicitly targets another platform.

### Secondary Supported Platform — Web Companion

- Desktop Chromium-based browsers.
- GitHub Pages free-tier static hosting.
- Installable PWA behavior.
- Online and offline operation where applicable.
- Every shared capability that can run safely within browser constraints should remain available here rather than being made desktop-only without a technical reason.

### Not Currently Required / Future Roadmap

The application should not intentionally break elsewhere, but the shipped Phase 31 acceptance baseline does not require the following (the new Android release has separate acceptance in [DUDE 2.0 Distributed Release Definition of Done — All Planned](../delivery/QUALITY_AND_RELEASE.md#dude-20-distributed-release-definition-of-done--all-planned)):

- Firefox parity — revisited in Phase 92;
- Safari parity — revisited in Phase 92;
- full mobile-web parity — remains later universal-web work. Native Android support is now required for the distributed release under Phases 31H–31I; Phase 91 expands that client;
- touch-first interactions — revisited as part of later universal-web work;
- narrow-screen layout quality — likewise later universal-web work;
- macOS desktop parity — Phase 39;
- Linux desktop parity — Phase 39.

Windows remains the desktop reference platform even if Phase 39 later makes desktop cross-platform.

### Device Roles

Every desktop DUDE installation supports three conceptual roles.

| Role | Purpose |
|---|---|
| **Client** | Electron/Angular interactive application |
| **Agent** | Privileged local execution on that machine |
| **Hub** | Optional authoritative self-hosted backend |

Example:

| Device | Client | Agent | Hub |
|---|---|---|---|
| Main Desktop | Yes | Yes | Yes |
| Second Desktop | Yes | Yes | No |
| Laptop | Yes | Yes | No |

A future release may allow:

Second Desktop may be Hub-capable and a standby backup target.

but only one Hub remains authoritative.

### React Native Mobile Application

The React Native application connects directly to the user's Hub.

It does not require an OpenAI/Azure/AWS/etc. application backend.

React Native DUDE connects to the user’s DUDE Hub over HTTPS/WSS.

#### Initial mobile scope

Do not port every DUDE tool initially.

Start with approximately 30-50 broadly useful, runtime-compatible tools.

Examples:

```text
JSON Formatter
Regex
JWT
UUID
Hash
Base64
Unix Time
Cron
Color tools
Text diff
Encoding
```

#### Mobile-native tools

Mobile can add capabilities not available on desktop/web:

```text
QR scanner
Barcode scanner
NFC inspector
BLE scanner
Share-to-DUDE
Camera OCR
Certificate viewer
Network diagnostics
Device information
Clipboard transforms
```

Mobile should not be treated merely as "smaller DUDE."
### Angular Web Application

The Angular application should be served by the user's Hub.

Example:

The browser loads Angular over HTTPS from DUDE Hub; the same Hub provides application API and realtime endpoints.

The user sees the same synchronized DUDE environment:

```text
favorites
workspaces
pipelines
projects
settings
registered devices
```

Browser-safe tools should execute locally in browser JavaScript/WebAssembly where possible.

Sensitive inputs should not be uploaded to the Hub merely because the UI is running in a browser.

The web client should use Hub services only when the feature genuinely requires:

- persisted synchronized state;
- authentication;
- collaboration;
- remote device coordination;
- explicitly server-side functionality.
## Terminology

To keep the distributed architecture unambiguous, the following terms should be used consistently.

### DUDE Environment

A user's complete logical DUDE installation, including:

- Hub;
- account/profile;
- synchronized data;
- registered devices;
- web access;
- mobile access;
- projects;
- workspaces;
- pipelines;
- favorites;
- settings.

### DUDE Hub

The self-hosted authoritative control plane.

The Hub may run on:

- a desktop;
- a workstation;
- a laptop;
- a home server;
- another user-owned machine.

The Hub provides:

- API;
- authentication;
- Angular web hosting;
- device registry;
- synchronization;
- realtime communication;
- collaboration;
- canonical persistence;
- backup coordination;
- future remote-job coordination.

### DUDE Desktop Client

The installed Electron + Angular user interface.

Every installed desktop device has a client.

### DUDE Device Agent / Device Runtime

The privileged local execution layer on each desktop/laptop.

The Agent is **not** an independent authoritative DUDE backend.

It exposes constrained capabilities to the local application and, in future phases, may accept strongly authorized remote jobs from the Hub.

### DUDE Device State Store

A local database, preferably SQLite, used for:

- cached synchronized state;
- offline replicas;
- device-specific settings;
- local-only data;
- synchronization journal/outbox;
- local history;
- pending operations.

It is not the canonical shared database.

**Delivered in Phase 31B (desktop).** The store is SQLite (`node:sqlite`) owned by the Device Agent process (an Electron utility process, the *state service*, in 31B; the resident per-user Agent from 31C); that process is deliberately not the privileged Device Runtime above. The renderer reaches it only through Electron main. It holds the device identity, scoped key/value settings, entity records with a coalesced durable outbox (recorded and never replayed until 31D), Local History and network runs, desktop preferences, mutation journals, snapshot headers, PowerShell history and secret references. **Settings › This Device** shows the device ID, an editable display name (default "Windows PC", never the hostname), platform, environment ID, enrollment state, store size, schema/migration/backup status and outbox count, and offers recovery actions plus two separate two-step resets: *Clear data* keeps the identity and secrets, *Reset this device* mints a new identity and wipes secrets. The web build has a per-browser installation identity and the same repository ports over browser storage, with no outbox. See [Phase 31B acceptance](../delivery/PHASE31B_ACCEPTANCE.md).

### DUDE Web

The Angular browser application served by the Hub.

It provides zero-install access through a browser and executes browser-safe tools locally where possible.

### DUDE Mobile

The React Native client for Android AAB/APK, with a path to iOS.

It connects to the user's Hub and contains mobile-native tool experiences.

## Multi-Device Ownership Model

The user experience should feel like one DUDE spread across the user's devices.

Example logical model:

The user owns Account/Profile, Global Settings, Favorites, Projects, Workspaces, Pipelines, and Tool Preferences, plus a Devices collection containing Main Desktop, Second Desktop, and Laptop.

The user's synchronized identity and shared configuration belong to the DUDE environment.

The physical characteristics of each computer belong to that device.

This distinction is foundational.

## Principal user journeys and failure states

| Journey | Required behavior |
|---|---|
| Keep using DUDE on one Windows computer | Existing tools, setup, routes, secure storage and local workflows work without a Hub or account |
| Enable Main Desktop as the Hub | Choose the additional Hub role, establish owner identity/recovery, use private exposure by default, and preview migration of selected shared records. **Phases 31C and 31D deliver** the optional Hub installer, the first-run setup wizard (owner password, one-time recovery codes, automatic self-enrollment of the desktop), loopback-by-default exposure with an explicit LAN option, the recovery paths and the first-sync preview (Merge, Use Hub or Keep local per category, with a recovery snapshot) before any record leaves the device |
| Connect Second Desktop or Laptop | Authenticate and enroll a distinct device; join the existing environment; initialize a local replica without creating a second authority. **Phase 31C delivers** enrollment through a pairing string or QR (with an upload disclosure) and an enrolled-device state; **Phase 31D delivers** the local replica: the first-sync preview, per-category consent, live apply of remote changes and a conflict inbox, without a second authority |
| Work while traveling | Run supported local tools, read cached records, edit permitted shared records offline, and see queued/conflicted/rejected sync state. **Phase 31D delivers** this on desktops: edits journal durably (surviving a restart), replay with backoff when the Hub is reachable, and unresolved conflicts and rejected operations wait in Settings › Sync |
| Use a remote browser | Open the Hub endpoint, authenticate, access selected shared workbench records and execute browser-safe transformations locally |
| Use Android | Connect/register, browse compatible tools, synchronize approved categories, and retain implemented local/cache behavior offline |
| Hub is powered off | Show Hub unavailable without disabling local tools or discarding pending edits; no promise of reachable Hub web/collaboration. **Phase 31D delivers** the offline state, durable pending operations and automatic catch-up |
| Replace the Hub computer | Restore a verified encrypted backup through a controlled transfer; reconnect devices to the sole authoritative endpoint |
| Revoke a lost device | Deny future authenticated access and sync; disclose that revocation cannot erase data already cached on an offline lost device. **Phase 31C delivers** two-step revocation that permanently denies the device key and closes its realtime session; **Phase 31D delivers** revoked-device sync semantics (the device freezes, keeps its data and may Continue standalone); sync-time verification for Internet exposure is verified in 31F |

Device setup must keep authentication failure, unreachable endpoint, incompatible version, untrusted TLS, revoked identity, pending migration and local-only operation distinguishable.
## Functional Capability Model

Tool availability follows declared platform capabilities, supported runtimes, permissions and installed dependencies. Discoverability is separate from authorization. See [Platform Capability Model](../architecture/SYSTEM_ARCHITECTURE.md#platform-capability-model) and [Portable Registry and UI Bindings](../architecture/SYSTEM_ARCHITECTURE.md#one-portable-registry-separate-ui-bindings).

## Tools and Tool Families

DUDE uses the eight categories Data, Text, Encoding, Security, Date & Time, Web, Developer and Documents. The complete phase inventories remain in [Delivery History](../history/DELIVERY_HISTORY.md) for shipped work and [Roadmap](../delivery/ROADMAP.md) for future work. [Initial Showcase Tool Set](../history/DELIVERY_HISTORY.md#initial-showcase-tool-set) preserves why the first tools were selected.

## Workspaces

Delivered workspaces combine tool tabs/panels, scratch data and Saved Sessions. Restoring a saved layout or applying a synchronized definition restores state; it must never run a script, pipeline, request or native mutation implicitly. Workspace payload retention and synchronization are separate choices governed by [Data and Sync Architecture](../architecture/DATA_SYNC_ARCHITECTURE.md). See [Phase 21 delivery evidence](../history/DELIVERY_HISTORY.md#phase-21) and [Workspace 2.0](../delivery/ROADMAP.md#phase-54) for retained future scope.

## Pipelines

Delivered pipelines compose compatible tool inputs/outputs and explicit sandboxed user-script steps. Runtime/capability gates must explain unavailable steps on web or offline devices. Sync may share an approved pipeline definition, not execute it. Graph workflows, branching and broader automation remain [Phase 55](../delivery/ROADMAP.md#phase-55) scope.

## Projects

Delivered Projects group saved workspace layouts and pinned pipelines. A synchronized project uses logical identity and explicit per-device path/credential bindings; missing bindings produce an explanatory state rather than automatic discovery or upload. See [Phase 25 delivery evidence](../history/DELIVERY_HISTORY.md#phase-25) and [Persistence, Scope and Consent](../architecture/DATA_SYNC_ARCHITECTURE.md#persistence-policy-scope-and-consent-are-separate-dimensions).

## Search and Command Palette

Search, Browse Tools and the command palette derive discovery from registry metadata. Home remains bounded independently of total tool count. [Command Palette Requirements](UX_SPEC.md#command-palette-requirements), [Home and Deck Requirements](UX_SPEC.md#home-and-deck-requirements) and [Navigation](UX_SPEC.md#navigation-and-information-architecture) own the interaction contracts.

## Offline Behaviour

The web companion is installable as a PWA. Desktop installation is handled separately by the Electron distribution path; this section governs only browser/PWA behavior.

### Required PWA Behavior

The original V1 requirement was simply to cache the application shell/static assets and keep local-only tools available offline after first load. As DUDE grows, the **standing PWA contract** is more selective; Phases 22 and 26 implemented and hardened this model.

- web app manifest;
- service worker;
- a **minimal initial application shell** cached eagerly;
- shell-critical static assets cached eagerly;
- browser-safe local tools available offline after the assets they require have been loaded;
- large lazy tool families cached on demand rather than blindly prefetched;
- optional WASM/language/runtime payloads cached on demand rather than treated as shell-critical assets;
- Cache Storage footprint is measurable and, as the platform grows, subject to explicit budgets/inspection;
- users can clear/repair optional cached runtimes without destroying unrelated local state where practical;
- update strategy documented;
- application can detect online/offline state;
- Web & Offline Settings shows storage and per-runtime cache status, supports storage persistence, and previews tool/category/all downloads before caching;
- Clear Runtime and Repair installation require a separate confirmation and leave saved tool data intact;
- uncached tools explain their offline state instead of failing with a blank screen.

### Network-dependent tools

Future tools may depend on public APIs.

Such tools must:

- clearly declare that network access is required;
- identify the external service, user-directed endpoint, local proxy, or user-owned infrastructure involved where practical;
- not break the rest of the app offline;
- display a compact offline state;
- degrade gracefully;
- avoid blocking application startup;
- keep network, persistence, platform/native-capability, and external-data-boundary metadata available to the shared shell so disclosure UI can explain **what will leave the machine, where it goes, and which platform capability is being used** before or while the action runs.

### Offline-First Behavior

If the Hub is unavailable:

```text
Main Desktop / Hub: OFF
Second Desktop:     ON
Laptop:             ON
```

Desktop and laptop tools continue to work.

Expected availability:

```text
JSON formatter        yes
JWT decoder           yes
Regex                 yes
Hash                   yes
filesystem tools       yes
process tools          yes
Docker tools           yes
local database tools   yes
local networking       yes
cached projects        yes
cached settings        yes
```

Changes to synchronizable state are written locally and queued.

Example:

```text
Sync Outbox
───────────
operation: UPDATE_PIPELINE
entity: Pipeline X
basedOnRevision: 17
status: pending
```

When the Hub returns:

The Device Sync Service reconnects to the Hub and reconciles pending changes.

pending changes reconcile.

Internet web access and cross-device sync are naturally unavailable while the Hub machine itself is offline.

This is an intentional consequence of genuine self-hosting.

### Web and Mobile During Hub Outage

When the Hub is offline:

- Internet-hosted Angular access is unavailable;
- mobile synchronization is unavailable;
- device-to-device synchronization is unavailable;
- Hub-hosted collaboration is unavailable.

Installed desktop clients continue to provide local functionality.

Mobile may retain cached/local functionality where implemented.

This tradeoff is intentional and must be communicated clearly:

> **If the user turns off every machine capable of hosting the Hub, there is no externally hosted DUDE service remaining online.**

For **24/7 Internet availability**, at least one Hub-capable machine SHALL remain powered on and network-connected, running the authoritative Hub service with a reachable Internet endpoint.

That is the literal consequence of personal ownership.

### Offline support matrix and reconnection rules

| Capability | Desktop with Hub unavailable | Hub web during outage | Android during outage |
|---|---|---|---|
| Portable local tool | Works when its runtime is available | Works only if already loaded/cached and implemented for offline use | Works for implemented compatible tools |
| Local filesystem/process/network work | Works when local capabilities/permissions are available | Not made native by Hub connectivity | Limited to declared mobile OS capabilities |
| Cached workbench records | Available within local access policy | Only deliberately cached authenticated state | Available where mobile cache is implemented |
| Shared edits | Durable local outbox and explicit pending state | Only if browser offline editing/outbox is deliberately implemented; otherwise disabled clearly | Queue only for implemented sync entities |
| Hub collaboration or cross-device synchronization | Unavailable until reconnect | Unavailable | Unavailable |
| New remote load of the Hub website | Not applicable | Unavailable when endpoint is down | Not applicable |

Local Docker/database tools mentioned in the target outage examples operate offline **once those tools are delivered** and their local dependencies are running; the examples do not reclassify Phase 33/34 as complete. Authentication expiry may pause network replay without deleting pending local changes. OS/native capability failures remain independent of Hub availability. A standalone Pages companion may still load from GitHub Pages during a personal Hub outage; it does not supply the unavailable private environment.
## Large Inputs

Large inputs are allowed.

The app should not impose arbitrary small text limits.

The original V1 explicitly did not require extreme-scale optimization. That baseline is preserved, but later desktop phases intentionally add streaming/large-file/log/filesystem scale where a specific workflow benefits from it; there is still no blanket requirement to optimize every tool for extreme inputs.

Expected behavior:

- remain responsive when practical;
- move expensive transforms into workers where useful;
- allow cancellation where practical;
- show a processing state;
- fail clearly if a browser/library limit is reached.

No guarantee is made for arbitrarily huge payloads.
## Scope Evolution and Deferred Capabilities

### Historical Exclusions Now Treated as Roadmap Territory

The original exclusions are preserved here so none of their rationale disappears. Their status changes from “permanently impossible” to one of: shipped, proposed, conditionally gated, or unscheduled.

- **User accounts** — owner identity, sessions, recovery and device registration are now near-term self-hosted Hub requirements in Phase 31C. Phase 81 becomes identity evolution, not the first introduction of identity. Vendor-hosted identity remains conditional under [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries).
- **Cloud synchronization / multi-device preferences** — user-owned Hub synchronization is now authorized near-term work in Phase 31D. Phase 82 retains end-to-end encryption and extended sync categories; Phase 83 deepens workspace continuity. Local-only mode remains first-class; vendor-hosted sync remains conditional.
- **Custom backend** — a *local bundled backend* shipped in Phase 8. A mandatory remote/cloud backend remains disallowed; the self-hosted Hub is now planned for Phase 31C; on-prem organizational expansion remains later.
- **Product database** — the self-hosted Hub requires a user-owned canonical SQLite WAL database in Phase 31C, plus device stores in Phase 31B. A vendor-operated database is not required. These product stores are distinct from Phase 33/48 tools that connect to user databases.
- **Telemetry platform / analytics dashboard** — not silently enabled. Phase 93 preserves the idea only as explicit opt-in diagnostics/product insights with payload transparency and no user-payload collection.
- **Collaborative editing** — already partially reopened and shipped through same-machine/LAN collaboration plus a BYO relay in Phase 8. Phase 53 expands self-hosted/accountless collaboration; Phase 84's DUDE-hosted service is conditional and blocked while the current hosted-cloud boundary stands.
- **DUDE-operated hosted snippet service** — a user-operated/self-hosted snippet-sharing service is in Phase 32; a DUDE-hosted service is not part of the current direction.
- **Extension marketplace / plugin installation from remote sources** — Phase 56 introduces a Local Plugin SDK; Phase 57 proposes signed, permission-declared extensions. Remote extension code must never become arbitrary native-code execution. A DUDE-hosted marketplace backend remains conditional; local/self-hosted catalogs are compatible with the current boundary.
- **Third-party authentication** — optional external OAuth may be enabled by a Hub owner, but a self-contained owner authentication and recovery path is required. Enterprise/source-hosting integrations remain later scope; no external OAuth provider is mandatory.
- **Mobile-first layout** — desktop is not redesigned around a phone. A separate React Native mobile-native client with approximately 30–50 compatible tools moves to Phases 31H–31I; Phase 91 becomes mobile depth and continuity.
- **Firefox-specific / Safari-specific optimization** — moved to distant Phase 92 Universal Web Platform rather than being permanently excluded.
- **Monaco-style full IDE workspace** — the literal permanent exclusion is retired, but replaced by the stronger identity boundary in [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries): Phase 77–80 may add editor/LSP/terminal/project surfaces without turning DUDE into a conventional IDE clone.
- **Cloud-hosted API proxy / cloud-hosted secret storage** — not part of the current product direction. Local proxies, local OS-keychain storage, self-hosted services, user-owned runners, and enterprise/on-prem infrastructure are allowed.
- **Elaborate onboarding / tutorial tours** — no longer permanently banned, but remain unscheduled and must not displace fast direct access for experienced developers.
- **Social sharing** — unscheduled; workflow/template sharing may exist through explicit exports, galleries, or self-hosted collaboration rather than social-network mechanics.
- **SEO-heavy content pages** — unscheduled and non-core; the workbench remains the product.
- **Public API documentation portal** — no longer impossible if Phase 97 turns internal seams into supported public SDK contracts.
- **Design system extraction / component package publishing** — no longer permanent exclusions; Phase 56/97/98 may require supported shared UI/component packages once there is a real external consumer.
- **Broad accessibility certification** — current baseline remains pragmatic, while Phase 30 and especially Phase 94 make accessibility maturity a real roadmap direction.
- **Exhaustive cross-browser testing** — not a current requirement; Phase 92 may establish a deliberate cross-browser CI matrix.
- **Exhaustive end-to-end/unit-test coverage** — still not a raw percentage goal, but Phase 23 materially raises verification standards for high-consequence tools through vectors, reference cross-checks, fuzzing, property tests, golden corpora, release gates, and performance regression fixtures.
- **Bundle-size optimization project** — superseded by a more useful Phase 22 model: chunk budgets, cache budgets, service-worker strategy audits, and dependency-boundary validation tied to actual product risk.
- **Localization/i18n** — no longer a permanent “never”; retained at the very distant Phase 94 horizon.

### Deferred / Roadmap-Tracked Scope

These items are not failures of the original product and are handled by the roadmap:

- WYSIWYG rich-text editor ([Phase 5](../history/DELIVERY_HISTORY.md#phase-5), #36) — ✅ shipped.
- Executable JavaScript playground, arbitrary HTML execution, arbitrary template execution, and sandboxed code runner (Phase 6) — ✅ shipped; see the amended standing security rule at [Security Boundaries](../architecture/SECURITY_ARCHITECTURE.md#security-boundaries).
- Cross-tool I/O, pipelines, Smart Paste, workspace/Saved Sessions, and local history (Phase 21) — ✅ shipped.
- Platform hardening/correctness/discovery/desktop shell/web efficiency (Phases 22–26) — completed consolidation wave.
- Native network diagnostics (Phase 27) — ✅ shipped.
- TLS, filesystem, theming, Windows/process, API/server, database, container, OS-integration, AI, and editor/browser integration work is tracked authoritatively in Phases 28–38. TLS and filesystem expansion shipped in Phases 28–29, theming/appearance shipped in Phase 30K (Phase 30 is complete), and Windows/process tooling shipped in Phase 31 (✅ Complete); the API/server through browser-integration work remains tracked in Phases 32–38.
- Long-horizon additions through Phase 100 are roadmap directions, not a fixed commitment or schedule.

## Deferred Definition

Anything not checked in the Definition of Done was not required to declare V1 successful.

A roadmap item remaining unbuilt is not a failure.

Stopping after a stable, deployed, extensible foundation was the intended outcome for V1. Further work now follows the [Roadmap Direction](../delivery/ROADMAP.md#roadmap-direction) roadmap rather than a scope gate.

### Decisions to close during implementation

The planning direction is sufficiently defined to begin 31A. The following implementation choices remain explicit rather than being silently treated as already decided:

| Decision | Required by | Guardrail |
|---|---|---|
| npm versus pnpm workspace migration | 31A | Choose from existing repository constraints; preserve reproducible builds and lockfile discipline |
| Package extraction order/runtime support | 31A | Representative complex/worker/native-adapter cases prove portability before broad migration |
| Device State Store process/service lifecycle | 31B (decided) | A utility-process state service supervised by Electron main with backoff, a degraded in-memory mode and a coordinated quit; distinct from Hub and from the privileged Device Agent. See PD-014; the process model was superseded in 31C by the resident Agent (PD-026) |
| Device Agent background/service lifecycle | 31C (resolved, implemented) | The state-service process became a resident per-user Device Agent that outlives the interactive window; it still never executes tools and grants no remote execution. Amended: the sign-in start falls back to the HKCU Run key for standard users, and the pipe name derives from a hash of the store directory. See [PD-026](../history/DECISION_LOG.md#phase-31c-implementation-decisions) |
| Hub framework/runtime and Windows service wrapper | 31C (resolved, implemented) | Fastify REST, Node single-executable, WinSW Windows service, Docker and foreground modes; independently managed user-owned service. Amended: Update Hub runs the bundled Hub installer in `/UPDATE` mode and is offered only from a per-machine install. See [PD-023](../history/DECISION_LOG.md#phase-31c-implementation-decisions), [PD-024](../history/DECISION_LOG.md#phase-31c-implementation-decisions), [PD-025](../history/DECISION_LOG.md#phase-31c-implementation-decisions) |
| Initial owner authentication/recovery mechanism | 31C (resolved, implemented) | Argon2id password plus recovery codes, one-time setup-token bootstrap, no external OAuth dependency; passkeys/TOTP deferred. See [PD-027](../history/DECISION_LOG.md#phase-31c-implementation-decisions), [PD-028](../history/DECISION_LOG.md#phase-31c-implementation-decisions), [PD-029](../history/DECISION_LOG.md#phase-31c-implementation-decisions) |
| Browser and device credentials, device enrollment | 31C (resolved, implemented) | Cookie sessions for browsers, a device-bound bearer session for the Agent, Ed25519 devices enrolled by pairing code; browsers are sessions, not devices. See [PD-030](../history/DECISION_LOG.md#phase-31c-implementation-decisions), [PD-031](../history/DECISION_LOG.md#phase-31c-implementation-decisions) |
| Transport trust, baseline controls, realtime and Hub web scope | 31C (resolved, implemented) | Pinned self-signed HTTPS on loopback by default, baseline security controls from the first endpoint, a minimal authenticated WebSocket, and an admin-surface Hub web. See [PD-032](../history/DECISION_LOG.md#phase-31c-implementation-decisions) to [PD-035](../history/DECISION_LOG.md#phase-31c-implementation-decisions) |
| Canonical identity and protocol versioning | 31C (resolved, implemented) | The Hub mints the environment ID; the canonical database holds synchronized records since 31D; one release train with negotiated protocol versions. See [PD-036](../history/DECISION_LOG.md#phase-31c-implementation-decisions), [PD-037](../history/DECISION_LOG.md#phase-31c-implementation-decisions) |
| Entity conflict policies and sync retention | 31D (resolved, implemented) | Per-entity `lww`, `merge3` and per-device policies, idempotent operations, tombstones, 90-day retention with snapshot rebase and a permanent conflict inbox. See [PD-040 to PD-044](../history/DECISION_LOG.md#phase-31d-implementation-decisions) |
| Hub web authenticated cache/offline-write policy | 31E | No private data in public asset cache; supported behavior must be visible |
| Reverse proxy/TLS/DNS and endpoint diagnostics implementation | 31F | Private by default; explicit public access and optional external infrastructure |
| Backup format, recovery keys and authority-transfer mechanism | 31G | Tested consistent restore, single authority and client rebase |
| Android framework tooling, SQLite/secure-storage adapters and supported OS baseline | 31H | React Native; audited runtime compatibility and permission handling |
| Exact initial 30–50 mobile tools and input budgets | 31I | Documented selection, usable native UI and core parity |
| Hub collaboration persistence and retention | 31J | Separate from the shipped ephemeral BYO relay |
| End-to-end encrypted data/secret synchronization | Phase 82 or separately approved scope | Not claimed by initial TLS-protected Hub-readable sync |
| Standby backup/replication and manual promotion UX | Later, under Phase 96 scope | No automatic multi-master/election requirement |

Resolve each choice with an architecture decision record and acceptance evidence. Changes to product invariants require an explicit PRD decision; routine library/framework choices do not reopen the agreed product direction.
