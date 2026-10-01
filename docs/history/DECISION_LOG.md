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

These IDs index existing decisions; they do not invent new decisions or dates. Detailed dated evidence and the full reconciliation table follow.

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
