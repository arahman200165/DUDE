# DUDE Delivery History

This document preserves shipped feature inventories, milestone narratives, original acceptance evidence and dated amendments from the consolidated PRD. Measurements and verification claims describe their historical baseline; this split does not re-run or re-date them.

Read [the master PRD](../DUDE_PRD.md) first. Product direction and invariants live there; this document owns provenance only and does not override active requirements.

Related: [DUDE — Product Requirements](../DUDE_PRD.md) · [DUDE Roadmap](../delivery/ROADMAP.md) · [DUDE Product Decision Log](DECISION_LOG.md) · [Quality and Release Specification](../delivery/QUALITY_AND_RELEASE.md).

## Contents

- [Product-positioning Evolution Record](#product-positioning-evolution-record)
- [Delivered Baseline through Phase 31](#delivered-baseline-through-phase-31)
- [Historical V1 Success Criteria and Continuing Principles](#historical-v1-success-criteria-and-continuing-principles)
- [In Scope (V1 — Delivered)](#in-scope-v1--delivered)
- [Historical Amendments Preserved](#historical-amendments-preserved)
- [Initial Showcase Tool Set](#initial-showcase-tool-set)
- [Phase 0 — Weekend Framework Showcase](#phase-0)
- [Phase 1 — High-Frequency Core Utilities](#phase-1)
- [Phase 2 — Structured Data Utilities](#phase-2)
- [Phase 3 — Web / API Utilities](#phase-3)
- [Phase 4 — Developer Workflow Utilities](#phase-4)
- [Phase 5 — Richer Editors and Advanced Tools](#phase-5)
- [Phase 6 — Executable / Sandboxed Tools](#phase-6)
- [Phase 7 — Showcase Backlog Closure](#phase-7)
- [Phase 8 — Downloadable Desktop App with a Bundled Backend](#phase-8)
- [Phase 9 — Structured Data Depth](#phase-9)
- [Phase 10 — Text Processing Depth](#phase-10)
- [Phase 11 — Encoding & Numeric Representation Lab](#phase-11)
- [Phase 12 — Security, Cryptography & Certificate Depth](#phase-12)
- [Phase 13 — Auth & JWT Depth](#phase-13)
- [Phase 14 — Date & Time Depth](#phase-14)
- [Phase 15 — Web & HTTP Depth](#phase-15)
- [Phase 16 — Regex Depth](#phase-16)
- [Phase 17 — Design, Markup & Media Tools](#phase-17)
- [Phase 18 — Code Generators & Developer References](#phase-18)
- [Phase 19 — IDs, Mock Data & Git/SQL/Container Config Tooling](#phase-19)
- [Phase 20 — File & Binary Format Inspection](#phase-20)
- [Phase 21 — Cross-Tool Workflow Foundations](#phase-21)
- [Phase 22 — Platform Hardening, Trust & Desktop-First Pivot](#phase-22)
- [Phase 23 — Correctness, Verification & High-Consequence Tool Hardening](#phase-23)
- [Phase 24 — Smart Entry, Discovery & Personal DUDE](#phase-24)
- [Phase 25 — Desktop-First Shell & Native Product Experience](#phase-25)
- [Phase 26 — Web Companion & PWA Efficiency](#phase-26)
- [Phase 27 — Networking Toolkit](#phase-27)
- [Phase 28 — DNS & Live TLS / Certificate Tools](#phase-28)
- [Phase 29 — Filesystem & Binary Forensics at Scale](#phase-29)
- [Phase 30 — Workbench Shell, Tool Discovery, Local Insights & Appearance](#phase-30)
- [Phase 31 — Windows & Process Tools](#phase-31)
- [Phase 31B — Device Identity, Scoped State and Migration](#phase-31b)
- [Phase 31C — Self-Hosted Hub, Identity and Canonical Persistence](#phase-31c)
- [Historical V1 Definition of Done](#historical-v1-definition-of-done)

## Product-positioning Evolution Record

The original V1 PRD correctly described DUDE at that time as a **static, single-page developer utility deck** whose primary deployment target was the GitHub Pages free tier. That historical description remains relevant to the V1 Definition of Done and the web companion, but it is no longer the correct description of the product as a whole after Phase 8. The previous wording that desktop was merely an additive wrapper or a conceptual “strict superset of the web PWA” is superseded: **DUDE Desktop is the canonical workbench; DUDE Web is the zero-install, browser-safe companion; both reuse the same core wherever platform constraints allow.**

## Delivered Baseline through Phase 31

V1 is complete. The extensible framework, all core infrastructure from the original weekend scope (registry, persistence, workers, PWA, GitHub Pages routing/CI), and the 10 initial tools (the original 9 showcase tools plus the UUID Generator / Inspector) were built, tested, deployed, and verified live at `https://arahman200165.github.io/DUDE/`. Every item in the historical [Historical V1 Definition of Done](#historical-v1-definition-of-done) V1 Definition of Done remains checked and verified against that deployment.

The product then continued through **Phases 1–21, all of which are complete**. Those phases expanded DUDE from the original showcase into hundreds of browser-capable tools, sandboxed execution, richer editors, structured/binary inspection, a shipped Windows Electron application, a local bundled backend, OS-level secure storage, AI regex assistance, local/self-hosted collaboration infrastructure, a universal I/O contract, transformation pipelines, user-defined sandboxed pipeline scripts, Smart Paste, persistent multi-tool workspaces, Saved Sessions, and persistent local history.

**Phase 8 (Downloadable Desktop App with a Bundled Backend) is complete** and is the turning point for the product hierarchy. Its eight shipped stages remain: Electron shell; native file access; OS-level secret storage; local LLM proxy + AI regex features; desktop shell chrome; local collab server; BYO relay server; auto-update + distribution. Those shipped details remain documented in [Phase 8](#phase-8).

**Phases 22–31 are also complete**: Phase 22 (Platform Hardening, Trust & Desktop-First Pivot) consolidated metadata/registry structure, trust, testing, and cache/bundle control; Phase 23 (Correctness, Verification & High-Consequence Tool Hardening) brought every one of the 277 tool manifests to a `verified` confidence tier; Phase 24 (Smart Entry, Discovery & Personal DUDE) turned Phase 21's Smart Paste/pipelines/workspaces/history into the primary paste-first, personalized entry experience — Recently Used, Favorites, Pinned Pipelines, Related-Tool and Pipeline Suggestions, Workspace Templates, Quick Run, and Unified Recents, all private-by-construction with no analytics or server telemetry; Phase 25 (Desktop-First Shell & Native Product Experience) finished that positioning change technically — Projects, a Desktop-Native Home, `dude://` deep links, a native OS menu, a six-source Command Palette, a Native File Recent List, crash/restart recovery, a Quick Launcher, native drag-and-drop routing, a generated file-association framework, Desktop Capability Indicators, desktop-first documentation, and a measured startup/parallelization pass — all shipped as Milestones 421–455. Phase 26 (Web Companion & PWA Efficiency) added selective offline readiness, install/share/handoff flows, browser-safe pipeline and workspace support, and web/desktop parity tests, shipped as Milestones 482–488. Phase 27 (Networking Toolkit) began the native expansion. It shipped 18 desktop network-diagnostics tools over a main-process-enforced IPC bridge and a bundled Windows ICMP helper, as Milestones 489–508. Phase 28 shipped live DNS, TLS and certificate inspection as Milestones 509–522. Phase 29 shipped filesystem scanning, watching and previewed mutation as Milestones 523–536. Phase 30 (Workbench Shell, Tool Discovery, Local Insights & Appearance) turned the tool deck into a bounded, user-designed workbench with a dedicated Browse Tools catalog, local insights, controlled theming, and an integrated scale/keyboard/platform verification gate, shipped as Milestones 537–592. Phase 31 (Windows & Process Tools) turned the desktop build into a Windows troubleshooting workbench, shipped as Milestones 593–614: a bundled native `windows-sys.exe` helper and fixed PowerShell 7 scripts for reads, plus the second local mutation engine ([Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract)) with a System Changes journal and previewed undo, delivered as 19 new routes (System Changes plus 18 tools) and two upgrades to existing tools (Local Network and PE Header Viewer; see [Phase 31](#phase-31)).

The roadmap retains stable Phase 0–100 identifiers and inserts the **Phase 31A–31I distributed foundation** after completed Phase 31 and before bulk Phase 32 expansion. Phase 31J adds deeper Hub collaboration after that foundation. It is now a dependency-led horizon through **Phase 100**, not an assertion that every later feature must wait for its original phase number. Completed Phases 22–26 consolidated platform structure, trust, discovery, desktop UX, and web/PWA efficiency. Phases 27–38 form the next major product expansion: Phases 27–29 shipped networking, live DNS/TLS and filesystem workflows; Phase 30 shipped the workbench shell, discovery, insights, appearance and its 30L integrated verification gate; Phase 31 shipped Windows/process/system tooling; and Phases 32–38 continue across local API/server development, live databases, containers, OS integration, AI-assisted utilities, VS Code integration, and browser-extension integration. Later phases extend into cross-platform desktop, automation, Git/SSH/package/build/log/proxy/database/container/Kubernetes workflows, secrets/PKI, collaboration/workspaces/pipelines, plugins/extensions, CLI/SDK/headless automation, AI, project/code/runtime tooling, and a deliberately distant platform/ecosystem horizon.

## Historical V1 Success Criteria and Continuing Principles

The weekend project was judged successful once all of the following were true. These criteria are the **historical V1 baseline**, not the complete modern quality contract for the product DUDE has since become. Their underlying principles — extension speed, deployment reliability, performance/isolation, architecture clarity, and predictable recovery — continue to apply, but later capabilities may and often must carry stricter capability-specific requirements.

The current product contract therefore layers the canonical Windows desktop application, shared-core web/desktop parity, native-security boundaries, platform/capability disclosure, and the stronger structural/correctness/release gates introduced from Phases 22–23 onward on top of this V1 baseline. Nothing in this section limits a later phase from establishing a higher bar for cryptography, authentication, native mutation, filesystem/process/database writes, network interception, code execution, plugins, automation, remote execution, or other high-consequence capabilities.

### Hard pass/fail criteria

#### A. Extension speed

A new simple tool with existing transformation logic can be added in **30 minutes or less**.

**Achieved:** the UUID Generator / Inspector ([Phase 1](#phase-1) #12) was added, registered, and verified end-to-end in 2 minutes 50 seconds with zero shell/core edits — well inside the target.

Adding that tool should require only:

1. creating the tool component;
2. defining the tool metadata;
3. optionally defining worker behavior;
4. optionally defining persistence behavior;
5. adding tests for core logic where justified;
6. registering/exporting the tool through the tool registry mechanism.

It must **not** require changes to:

- global navigation;
- application shell;
- command palette implementation;
- search implementation;
- route layout code;
- PWA infrastructure;
- persistence infrastructure;
- worker infrastructure.

#### B. Deployment reliability

The repository must support:

- one production build command;
- automated GitHub Pages deployment through CI;
- correct asset paths under the repository base path;
- clean tool URLs;
- direct refreshes on tool routes;
- a `404.html` SPA fallback strategy suitable for GitHub Pages;
- PWA asset caching;
- predictable handling of deployed updates.

If a user opens a saved tool route directly from a bookmark, the app must recover correctly.

### Strong targets

#### C. Performance and isolation

- The shell should remain responsive during expensive work.
- Heavy or potentially blocking tasks can opt into a reusable worker execution layer.
- Worker-backed tasks must support cancellation where practical.
- Heavy tools should be lazy-loaded.
- A broken or computationally expensive tool should not take down navigation for the whole deck.

No strict bundle-size target is required.

The project deliberately prioritizes shipping and library reuse over extreme bundle minimization.

#### D. Architecture clarity

A developer unfamiliar with the codebase should be able to understand, from the repository structure and documentation:

- where tools live;
- how a tool is registered;
- how routes are created;
- how search metadata works;
- how per-tool persistence works;
- how workers are used;
- how API keys are handled;
- how network-dependent tools declare online requirements;
- how a new tool should be implemented.

## In Scope (V1 — Delivered)

The weekend implementation delivered:

- Angular application foundation;
- dense dark-only UI shell (dark-only at V1; Phase 30K later added Light and the other first-party appearance options, keeping Dark as the default);
- deck home;
- persistent sidebar;
- global search;
- command palette;
- dedicated route for each tool;
- clean GitHub Pages routing;
- tool registry;
- category system;
- tool metadata model;
- shared tool layout primitives;
- per-tool persistence policy;
- shared local storage/session storage abstraction;
- reusable worker execution abstraction;
- online/offline awareness;
- PWA installability;
- service worker caching;
- lazy loading for tool routes;
- GitHub Pages CI deployment;
- error isolation at route/tool boundary where practical;
- basic keyboard usability;
- documentation for adding a tool;
- 9 showcase tools, plus a 10th (UUID Generator / Inspector) added as the extension-speed proof;
- a small number of framework-critical tests;
- a small number of deployment/navigation smoke tests.

## Historical Amendments Preserved

Documentation split note: legacy section references in the preserved excerpts now use links. Dates, substantive wording, supersession notes and completion evidence retain their historical meaning.

**Current reconciliation, 2026-10-01:** the following dated excerpts and supersession notes are historical. References in them to accounts, databases or sync being excluded do not prohibit the newly planned user-owned Hub. [Persistence Policy](../architecture/DATA_SYNC_ARCHITECTURE.md#persistence-policy), [Delivered Repository Architecture](../architecture/SYSTEM_ARCHITECTURE.md#delivered-repository-architecture) and [Security Boundaries](../architecture/SECURITY_ARCHITECTURE.md#security-boundaries) and Phases 31A–31I govern the target. Vendor-operated hosting remains excluded. No past completion status is changed.

These three amendments are reproduced verbatim from the pre-2026-09-25 PRD (only inline `[Roadmap Direction](../delivery/ROADMAP.md#roadmap-direction) Phase N` pointers are updated, to the phase's current number after the roadmap renumbering — the wording, bullet structure, and terminology in use at the time, including "Track A"/"Track B", are otherwise untouched). Each is followed by a dated **Superseded** note stating explicitly which specific claims this rewrite has since changed, so the historical record stays legible without silently contradicting the current doc.

**Amendment (2026-09-20):** Electron/Tauri/native desktop packaging is **no longer a permanent non-goal**. [Roadmap Direction](../delivery/ROADMAP.md#roadmap-direction) (the Roadmap's Phase 8 and its Track B rationale) adopts desktop packaging as a real future direction, since a large class of genuinely useful tools ([Roadmap Direction](../delivery/ROADMAP.md#roadmap-direction), Track B) needs native OS/network/filesystem access a browser tab cannot get. This is a narrow, deliberate carve-out, not a general reopening of the list above:

- a desktop build's **local, bundled backend** — used only to give Track B tools OS/network/filesystem access on the user's own machine — is now in scope;
- a **cloud-hosted** backend, a DUDE-operated database, user accounts, and cloud sync remain permanent non-goals for the product as a whole, desktop included, unless a future decision explicitly revisits them ([Non-authoritative monetization sketch](DECISION_LOG.md#non-authoritative-monetization-sketch) flags this exact tension and does not resolve it);
- the web/GitHub Pages build remains the permanent zero-install default ([Desktop is canonical; web preserves zero-install reach](../DUDE_PRD.md#desktop-is-canonical-web-preserves-zero-install-reach)) — desktop is additive, not a replacement.

**Superseded 2026-09-25:** the third bullet's "desktop is additive, not a replacement" is reversed by the current [Desktop is canonical; web preserves zero-install reach](../DUDE_PRD.md#desktop-is-canonical-web-preserves-zero-install-reach) — desktop is now the canonical workbench and the web/GitHub Pages build is the zero-install companion, not the default. The first two bullets' substance still stands: the local bundled backend remains in scope, and a cloud-hosted backend/database/accounts/sync remain outside the current product direction, now stated as durable boundaries in [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries) and tracked as conditional roadmap territory in [Historical Exclusions Now Treated as Roadmap Territory](../product/PRODUCT_SPEC.md#historical-exclusions-now-treated-as-roadmap-territory).

**Amendment (2026-09-20):** "collaborative editing" above is narrowed by the same carve-out, not reopened wholesale. [Phase 8](#phase-8) Stages 6–7 ship real-time collaborative editing for Advanced Markdown Workspace, entirely within the scope the desktop-packaging amendment already grants:

- a same-machine/LAN local collab server (Stage 6) and a user's own self-hosted relay (Stage 7, `relay/`, BYO — never a DUDE-run service) are in scope, because both are either the desktop build's local, bundled backend or infrastructure the user stands up themselves;
- a DUDE-operated, cloud-hosted collaboration service — hosted rooms, accounts, server-stored documents — remains a permanent non-goal, unchanged from the list above;
- the web/GitHub Pages build has no collaboration feature and isn't gaining one — this is desktop-only, additive, consistent with [Desktop is canonical; web preserves zero-install reach](../DUDE_PRD.md#desktop-is-canonical-web-preserves-zero-install-reach).

**Superseded 2026-09-25:** the closing "consistent with [Desktop is canonical; web preserves zero-install reach](../DUDE_PRD.md#desktop-is-canonical-web-preserves-zero-install-reach)" reads differently under the current [Desktop is canonical; web preserves zero-install reach](../DUDE_PRD.md#desktop-is-canonical-web-preserves-zero-install-reach) (desktop is canonical, not merely additive), though the underlying fact is unchanged — collaboration is still desktop-only and the web build still has none. The second bullet's "permanent non-goal" is restated as conditional, gated territory at [Historical Exclusions Now Treated as Roadmap Territory](../product/PRODUCT_SPEC.md#historical-exclusions-now-treated-as-roadmap-territory) (Phase 84, DUDE-hosted collaboration), not reopened.

**Amendment (2026-09-21):** the product has grown well past the original weekend MVP this list was written to protect, and several further items are revisited — each a narrow, deliberate carve-out, not a reopening of anything else on the list:

- **multi-tool tabs, resizable workbench panels, user-defined tool scripting** are no longer permanent non-goals — see [Phase 21](#phase-21), whose ceiling is explicitly "a multi-tool workbench, not a source-code IDE." Draggable panel rearrangement and a Monaco-style full IDE remain out of scope, unchanged above.
- **multi-window workflows** is no longer a permanent non-goal — see [Phase 35](../delivery/ROADMAP.md#phase-35). This is OS/window-management territory, distinct from Phase 21's single-window workbench above.
- **"shareable server-stored snippets"** is narrowed, not removed — reworded above to **"DUDE-operated hosted snippet service"**, since a self-hosted/BYO snippet-sharing service is now in scope ([Phase 32](../delivery/ROADMAP.md#phase-32)), on the same BYO-deployment precedent as collaborative editing above; a DUDE-run one remains out of scope.
- **"secret storage service"** is narrowed, not removed — reworded above to **"cloud-hosted secret storage service"**, since a local-only secrets vault built on the desktop track's `secure-local`/OS-keychain tier is now in scope ([Phase 35](../delivery/ROADMAP.md#phase-35), with deeper work in Phase 51); a cloud-hosted one remains out of scope.
- **VS Code extension, browser extension packaging** are no longer permanent non-goals — see [Phase 37](../delivery/ROADMAP.md#phase-37) and Phase 38, both distribution/integration targets needing their own scoping pass.
- **theme customization, light mode** are no longer permanent non-goals — see [Phase 30](#phase-30). This reverses an explicit, still-current design decision ([Theme](../product/UX_SPEC.md#theme), [Color System](../product/UX_SPEC.md#color-system), `AGENTS.md`, [Interview Questions and Answers](DECISION_LOG.md#interview-questions-and-answers) Q12) that will need its own amendments if and when that phase is actually adopted; nothing about those living specs changes now.
- localization/i18n was also considered and is **not** revisited — it stays a permanent non-goal, unchanged above.

**Superseded 2026-09-25:** two of the seven bullets above no longer hold as written. [Theme](../product/UX_SPEC.md#theme) is itself amended by this rewrite — theme customization/light mode is no longer described elsewhere in the doc as "an explicit, still-current design decision," so that bullet's closing "nothing about those living specs changes now" is no longer accurate; see the current [Theme](../product/UX_SPEC.md#theme) and [Interview Questions and Answers](DECISION_LOG.md#interview-questions-and-answers) Q12 directly. Localization/i18n's "stays a permanent non-goal, unchanged" is also reversed — [Historical Exclusions Now Treated as Roadmap Territory](../product/PRODUCT_SPEC.md#historical-exclusions-now-treated-as-roadmap-territory) now retains it as a distant, unscheduled Phase 94 possibility rather than a permanent exclusion. The other carve-outs and their stated ceilings (multi-tool workbench not an IDE; Monaco-style IDE and draggable panels out of scope; BYO-only snippet/secrets deployment) remain the current, accurate boundary. `AGENTS.md`'s top-of-file product description has also been updated as part of this rewrite to describe desktop-canonical/web-companion positioning instead of the old "static PWA deployed to GitHub Pages" framing, so it no longer contradicts this section; its dark-mode-only line is unaffected until Phase 30 actually ships.

**Superseded 2026-09-29:** the theming half of Phase 30 has now shipped as Phase 30K (Milestones 577–585), so the "theme customization, light mode" bullet's pending amendments are made: [Theme](../product/UX_SPEC.md#theme), [Color System](../product/UX_SPEC.md#color-system), [Accessibility](../product/UX_SPEC.md#accessibility), `AGENTS.md`'s product description and [Interview Questions and Answers](DECISION_LOG.md#interview-questions-and-answers) Q12 now describe a dark-default product with controlled first-party appearance options (Milestone 586). The controlled-customization ceiling is stated explicitly in Phase 30's scope boundaries and in Phase 30K ("Customization means composing first-party, pre-validated options per axis…").

## Initial Showcase Tool Set

The weekend MVP shipped **9 tools**, chosen because together they exercise different framework capabilities (parsing, worker execution, persistence policy, sensitive-data handling, third-party rendering, split-pane layouts, live computation). A 10th tool, UUID Generator / Inspector, was added ahead of schedule as the extension-speed proof ([A. Extension speed](#a-extension-speed)).

Each tool originally shipped with its own detailed feature list and a per-item "explicitly deferred" list; those lists are no longer reproduced here since every item on them was resolved during Phases 1–7 (see [Phase 7](#phase-7) in particular, which closed out this exact backlog). What still matters from V1 is *why* each tool was chosen — that framework-breadth rationale is preserved below.

| Tool | Category | Why it was included |
|---|---|---|
| JSON Formatter / Validator | Data | Core daily utility; strong test of parsing, errors, formatting, large text input, copy actions, and worker execution. |
| Regex Tester | Developer | Tests dynamic state, flags, match highlighting, potentially dangerous computation, and worker cancellation. |
| Unix Timestamp Converter | Date & Time | Small, fast tool validating the low-friction end of the architecture. |
| Base64 Encoder / Decoder | Encoding | Simple bidirectional transform and a good shared-layout test. |
| Markdown Preview | Documents | Tests split-pane layouts, third-party rendering, sanitization considerations, and live preview. |
| JWT Debugger | Security | Tests sensitive data handling, structured decode, nonpersistent default state, and warning UX. |
| Text Inspector | Text | Covers live computation and common text metrics with minimal complexity. |
| Hash Generator | Security / Encoding | Tests async browser APIs, binary/text conversion, and worker-friendly computation. |
| Text Diff | Text | Tests third-party libraries, larger inputs, two-pane layouts, rendering, and worker isolation. |
| UUID Generator / Inspector | Developer | Originally planned as Phase 1 item #12; shipped early as the timed extension-speed proof ([A. Extension speed](#a-extension-speed)) — added, registered, and verified in 2 minutes 50 seconds with zero shell/core edits. |

Every feature and every originally-deferred capability across these 10 tools was eventually shipped — see each tool's entry in the live app, and [Roadmap Direction](../delivery/ROADMAP.md#roadmap-direction) Phases 1–7 for when and how.

<a id="phase-0"></a>

## Phase 0 — Weekend Framework Showcase

**Status:** ✅ Complete

1. JSON Formatter / Validator
2. Regex Tester
3. Unix Timestamp Converter
4. Base64 Encoder / Decoder
5. Markdown Preview
6. JWT Debugger
7. Text Inspector
8. Hash Generator
9. Text Diff
10. UUID Generator / Inspector — shipped early as the timed extension-speed proof ([A. Extension speed](#a-extension-speed)); originally planned as Phase 1 item #12 below.

**Goal:** Validate architecture breadth. **Achieved** — all 10 tools shipped, deployed, and verified live.

<a id="phase-1"></a>

## Phase 1 — High-Frequency Core Utilities

**Status:** ✅ Complete

10. URL Encoder / Decoder — ✅ shipped
11. Query String Parser / Builder — ✅ shipped
12. UUID Generator / Inspector — ✅ shipped early, see Phase 0
13. Case Converter — ✅ shipped
14. Whitespace Cleaner / Normalizer — ✅ shipped
15. Slug Generator — ✅ shipped
16. HTML Entity Encoder / Decoder — ✅ shipped
17. Color Converter — ✅ shipped
18. Number Base Converter — ✅ shipped

**Goal:** Validate the "new tool in ≤30 minutes" success criterion across a batch of simple tools. **Achieved** — all remaining Phase 1 tools shipped, tested, and verified against direct-route resolution.

<a id="phase-2"></a>

## Phase 2 — Structured Data Utilities

**Status:** ✅ Complete

19. YAML ↔ JSON Converter — ✅ shipped
20. XML Formatter / Validator-lite — ✅ shipped
21. CSV Viewer / Converter — ✅ shipped
22. JSONPath / JMESPath Tester — ✅ shipped
23. JSON Structural Explorer — ✅ shipped as a "Tree" view on the JSON Formatter tool, see [Initial Showcase Tool Set](#initial-showcase-tool-set)

**Goal:** Exercise more complex third-party libraries and richer structured outputs. **Achieved** — `js-yaml`, `fast-xml-parser`, `papaparse`, `jsonpath-plus`, and `jmespath` are each wrapped behind a pure, worker-compatible transform; two new shared UI primitives (`app-tree-view`, `app-data-table`) were introduced for structural/tabular display.

<a id="phase-3"></a>

## Phase 3 — Web / API Utilities

**Status:** ✅ Complete

24. HTTP Status Code Reference — ✅ shipped
25. HTTP Header Inspector / Builder — ✅ shipped
26. cURL Command Inspector / Converter — ✅ shipped, with code export to 8 languages
27. Cron Expression Parser / Next-Run Preview — ✅ shipped
28. User-Agent Parser — ✅ shipped
29. MIME Type Reference / Lookup — ✅ shipped

**Goal:** Cover common web/API-adjacent lookups and parsers entirely offline. **Achieved** — all 6 tools are fully local; `cron-parser`/`cronstrue` and `ua-parser-js` were added, and two new shared primitives (`app-copy-button`, `app-key-value-editor`) were extracted once their patterns started repeating.

### Notes

Local static references are preferred when practical. The HTTP Status Code Reference and MIME Type Reference ship as curated, verified-accurate subsets of their IANA registries rather than exhaustive transcriptions.

<a id="phase-4"></a>

## Phase 4 — Developer Workflow Utilities

**Status:** ✅ Complete

30. Semantic Version Comparator — ✅ shipped, with sorting and range-satisfaction checking
31. Glob Pattern Tester — ✅ shipped
32. URL / URI Inspector — ✅ shipped, with editable round-trip reconstruction
33. Date / Timezone Converter — ✅ shipped, as a multi-zone world clock
34. Duration Parser / Formatter — ✅ shipped
35. Random Data Generator — ✅ shipped, with full `@faker-js/faker` category coverage

**Goal:** Cover common developer-workflow utilities (versioning, glob matching, URL inspection, timezones, durations, fake test data) entirely offline. **Achieved** — all 6 tools are fully local; `semver`, `picomatch`, `luxon`, `parse-duration`, `humanize-duration`, and `@faker-js/faker` were added, continuing the library-forward pattern ([Dependency Philosophy](../architecture/SYSTEM_ARCHITECTURE.md#dependency-philosophy)) for fiddly parsing/formatting domains.

<a id="phase-5"></a>

## Phase 5 — Richer Editors and Advanced Tools

**Status:** ✅ Complete

36. WYSIWYG Rich Text Editor — ✅ shipped, via TipTap with sanitized HTML and Markdown export
37. Advanced Markdown Workspace — ✅ shipped, with GFM extras, front matter, a table of contents, and synced-scroll preview
38. JWT Signature Verification — ✅ shipped, as a separate JWT Signature Verifier tool (HMAC, RSA/EC/RSA-PSS, and JWKS)
39. File Hashing — ✅ shipped, as a separate File Hash Generator tool
40. File Base64 Conversion — ✅ shipped, as a separate File Base64 Converter tool
41. Advanced Diff / Merge — ✅ shipped, with line/word/character diffing, a merge view, and unified-diff export
42. JSON Schema Validator — ✅ shipped, supporting both Draft-07 and 2020-12

**Goal:** Validate that larger third-party libraries, new file-handling patterns, and the platform's first genuinely network-capable tool could ship without weakening the local-first/offline-first architecture. **Achieved** — `jose`, `ajv`/`ajv-formats`, the TipTap stack, and `markdown-it-task-lists` were added, all lazy-loaded per tool; a shared `FileDrop` component and `downloadFile` utility were introduced. JWT Signature Verification's JWKS-fetch mode is the first tool to call `fetch`, scoped so the tool's other, fully local modes stay usable offline.

<a id="phase-6"></a>

## Phase 6 — Executable / Sandboxed Tools

**Status:** ✅ Complete

48. JavaScript Playground — ✅ shipped, runs JS snippets with captured console output and a hard execution timeout
49. HTML Preview — ✅ shipped, live-renders pasted HTML including its own inline `<script>`/`<style>`
50. Template Renderer — ✅ shipped, renders EJS templates against a JSON context, reusing the JS Playground's execution engine
51. Python Playground — ✅ shipped, runs Python via Pyodide (WebAssembly CPython, standard library only)

**Goal:** ship the platform's first arbitrary-code-execution tools without weakening DUDE's security posture. **Achieved** — a shared `src/app/shared/code-sandbox/` module (an opaque-origin sandboxed iframe plus a nested, force-terminable Worker) backs the JS Playground and Template Renderer; HTML Preview uses a tool-local variant since it needs a live DOM; Python Playground self-hosts the Pyodide runtime behind its own lazy service-worker asset group. Ships as Milestones 17–20; [Security Boundaries](../architecture/SECURITY_ARCHITECTURE.md#security-boundaries)'s former standing "no arbitrary code execution" rule is amended accordingly — see [Security Boundaries](../architecture/SECURITY_ARCHITECTURE.md#security-boundaries).

<a id="notes-2"></a>

### Notes

Implementation details (the sandbox's CSP/CORS/iframe-recreation gotchas, and the EJS client-bundle packaging decision) are documented at `src/app/shared/code-sandbox/code-sandbox-doc.ts` rather than repeated here.

<a id="phase-7"></a>

## Phase 7 — Showcase Backlog Closure

**Status:** ✅ Complete

Every item explicitly deferred in the original showcase tools' write-ups ([Initial Showcase Tool Set](#initial-showcase-tool-set)), revisited once the platform had grown well past that MVP. Most landed as enhancements to the existing tool rather than new tools. Five items were large/independent enough to become new tools:

43. JWT Signer — ✅ shipped, symmetric (HMAC) and asymmetric (RSA/EC/RSA-PSS) signing with in-browser key-pair generation
44. Recurrence Rule Calculator — ✅ shipped, expands an iCal-style RRULE recurrence into occurrence dates
45. Date Calculator — ✅ shipped, business-day-aware date arithmetic and day-counting
46. Directory Diff — ✅ shipped, folder-vs-folder added/removed/changed comparison with a text line-diff or binary hex-diff drill-down
47. Git Repo Browser — ✅ shipped, client-side commit-history browsing and commit-vs-commit diffing over a locally-selected `.git` folder

**Goal:** close out the showcase backlog without compromising the offline-first, dependency-minimal architecture. **Achieved** — `uuid`, `rrule`, `isomorphic-git`, `jsonrepair`, `regexp-tree`, and `franc-min` were added; Text Inspector's grammar-check mode became the second tool (after JWT Signature Verifier) to call `fetch`; Markdown Preview/Workspace gained style presets plus a sandboxed-iframe path for custom CSS/plugins — all with no changes to the shell/registry/persistence/worker infrastructure.

**Explicitly out of scope at the time, now revisited:**

- **AI-based regex generation/explanation** needed either a hosted LLM proxy or local-model support DUDE didn't have at the time — ✅ shipped since, as part of [Phase 8](#phase-8) Stage 4's local LLM proxy (natural-language → regex generation and an "AI Explain" panel on Regex Tester). The rest of the source material's "Local AI Utilities" family that Stage 4 didn't cover is now expanded in Phase 36 (AI-Assisted Utilities), with deeper on-device AI in Phase 69 and AI workflow/agent work in Phases 70–71.
- **Collaborative real-time editing** (Markdown) over the open internet via DUDE-operated hosted rooms/documents/auth remains outside the current hosted-cloud boundary. The shipped, in-scope model is narrower: same-machine/LAN collaboration and a user's own self-hosted relay; see [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries) and [Phase 8](#phase-8) Stages 6–7.

<a id="notes-3"></a>

### Notes

Grammar checking's LanguageTool dependency is the platform's first *external* API call (JWT Signature Verifier's JWKS mode fetches only URLs the user supplies themselves); its free-tier limits are why it's a manual "Check" button rather than live-as-you-type.

Git Repo Browser and Directory Diff both read an entire local folder into browser memory via `<input webkitdirectory>` rather than the File System Access API's `showDirectoryPicker()`, for broader browser support.

<a id="phase-8"></a>

## Phase 8 — Downloadable Desktop App with a Bundled Backend

**Status:** ✅ Complete — Framework: Establishes the Desktop-Packaging Track — all 8 stages shipped

Like Phase 0, this is a framework-first phase: it adds a new deployment target and a bundled backend, not new tools with registry entries. Tool-level enhancements that land as part of this phase (Regex Tester, Advanced Markdown Workspace, Directory Diff, Git Repo Browser) stay documented inside their own [Initial Showcase Tool Set](#initial-showcase-tool-set) sections rather than incrementing the shipped-tool count, the same way Phase 7's enhancements did.

**Original Phase 8 implementation goal (historical):** ship a Windows Electron build in which every existing web tool still works identically while unlocking backend-dependent features impossible on static GitHub Pages hosting: an AI-assisted regex workflow and real-time collaborative Markdown editing. The Phase 8 design was originally described as a “strict superset of the web PWA.”

**Current product interpretation:** that “strict superset” phrase is retained only as Phase 8 history, not as the conceptual definition of desktop. DUDE Desktop is now the canonical workbench; the web/PWA build is the browser-safe companion generated from the same shared core.

**Approved direction**, decided directly with the user:

- **Packaging:** Electron.
- **Backend:** a localhost-only LLM proxy process, provider-agnostic (a configured OpenAI-compatible base URL + API key, so it works with OpenAI, Anthropic-compatible gateways, local Ollama, OpenRouter, etc.) — plus a local collab server for same-machine/LAN sessions, extended by a **BYO relay server** for cross-network collaboration.
- **BYO relay, not a DUDE-run service:** DUDE ships the relay server's code (e.g. as a Dockerfile/small deployable unit in this repo); each user self-hosts their own instance and points their desktop app at it. DUDE itself never operates shared infrastructure — see the durable hosted-cloud boundary in [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries).
- **Tool surface (Phase 8 implementation fact):** the same Angular codebase kept all existing tools unchanged while desktop-only features were additive and feature-detected. Future phases may design desktop-first shell experiences, but shared tools still reuse the same core.
- **Distribution:** Windows only for now, via the Microsoft Store (free Microsoft-signed) and/or an unsigned installer on the GitHub Releases page.

### Staged roadmap

Each stage is expected to become its own Milestone number when implemented, following the existing convention that framework-layer work gets its own milestone rather than being folded into a tool commit.

1. **Electron shell** — package the existing Angular app in Electron with no new features; prove build/run/package works before anything else is layered on. Establishes a platform/environment detection service (web vs. desktop) as the seam every later stage conditions on. **✅ shipped as Milestone 21.**
2. **Native file access** — replace `<input webkitdirectory>` in Directory Diff and Git Repo Browser with Electron's native `dialog` + filesystem APIs, via a sandboxed preload/IPC bridge (no direct Node access from the renderer). Upgrades both tools from one-shot snapshots to live, re-scannable folder handles, desktop-only. **✅ shipped as Milestone 22.**
3. **OS-level secret storage** — a new `secure-local` tier backed by Electron `safeStorage` (OS keychain), available only on desktop. Lays the groundwork for storing the LLM proxy's API key safely. **✅ shipped as Milestone 23.**
4. **Local LLM proxy + AI regex features** — the localhost-only backend process holds the user-supplied, provider-agnostic LLM credential; wires up AI-based regex generation (natural-language → regex) and an "AI Explain" panel on Regex Tester, next to the existing rule-based `regexp-tree` explainer, which stays as the offline/web fallback when no key is configured. **✅ shipped as Milestone 24.**
5. **Desktop shell chrome** — system tray, launch-on-login, native OS notifications, a global-hotkey clipboard quick-action registry (Base64 encode/decode, UUID generate, SHA-256 hash), and file-watch infrastructure (wired into selected tools later in Phase 29; see the Stage 5 note below). **✅ shipped as Milestone 25.**
6. **Local collab server** — a same-machine/LAN real-time collaboration backend for Advanced Markdown Workspace, CRDT-based via Yjs. **✅ shipped as Milestone 26.**
7. **BYO relay server for cross-network collab** — a standalone relay server shipped from this repo (`relay/`, with a `Dockerfile`) that users self-host and point their desktop app at via a configured URL in Settings, extending Stage 6's collab session across networks. **✅ shipped as Milestone 27** — see the Stage 7 note below for the room/session identity model actually implemented, and what of the original open question remains deferred. **Follow-up (Milestone 477):** the relay URL is now owned by Advanced Markdown Workspace (its only consumer), stored under that tool's own namespace (migrated once at startup from the legacy `settings:relayUrl` key) and edited in Settings › Tools › Markdown Workspace. A saved workspace, template, or project may override it, set from the Workspace settings popover or the Host panel, which shows whether the global or the workspace relay applies.
8. **Auto-update + distribution** — `electron-updater` against GitHub Releases; a new CI workflow builds a Windows installer via `electron-builder` (NSIS for the unsigned GitHub Releases path, MSIX/appx for Microsoft Store submission), separate from the existing GitHub Pages `deploy.yml`. Store submission itself (Partner Center) is a manual process, not automated in CI. **✅ shipped as Milestone 28** — see the Stage 8 note below for the versioning/release-automation model actually implemented and the placeholder Store identity values that still need a real swap before submission.

**Explicitly deferred within Phase 8:** macOS/Linux builds, code-signed non-Store distribution, named-but-accountless relay participants (Stage 7 shipped anonymous room codes only — see the Stage 7 note), any provider-specific (non-OpenAI-compatible) LLM integration. The file-watch consumer deferred here shipped later in Phase 29: Directory Diff, Git Repo Browser and Large-File Inspector.

<a id="security-notes-extending-31"></a>

### Security notes (extending [Security Boundaries](../architecture/SECURITY_ARCHITECTURE.md#security-boundaries))

- The bundled backend must bind to `127.0.0.1` only (falling back to `127.0.0.2`, `127.0.0.3`, etc. if something else is already listening there, or to another user-provided address) — never an external interface. **One deliberate, narrow exception:** Stage 6's local collab server binds `0.0.0.0`, since LAN reachability is the entire point of that stage; the mitigation is a random per-session code required as a `?code=` query param before any WebSocket connection is accepted, not network-interface restriction.
- The Electron renderer keeps `contextIsolation` on and no direct `nodeIntegration`; all native access (files, secrets, tray, IPC to the local backend) is mediated through a preload bridge — consistent with the sandboxing precedent already set by the Advanced Markdown Workspace's plugin `<iframe>`s ([Initial Showcase Tool Set](#initial-showcase-tool-set); [Security Boundaries](../architecture/SECURITY_ARCHITECTURE.md#security-boundaries)).
- A self-hosted BYO relay server is untrusted-by-default from the app's perspective: treat its messages as data, not as anything the app should extend trust or execute based on. In practice (Stage 7), this means every message a relay forwards is applied purely as opaque Yjs CRDT sync/awareness data — the relay never supplies a URL, config, or code the app follows or executes.

<a id="notes-4"></a>

### Notes

Stage 1 chose a local loopback static server (bound `127.0.0.1`, OS-assigned port) to serve the built app to the `BrowserWindow` over `http://`, instead of a `file://` load — this means the existing path-based router needed no hash-routing fork, and the server does real SPA fallback to `index.html` instead of needing the web build's `public/404.html` GitHub Pages workaround. The new `electron/` folder (main process + preload, compiled by `esbuild` to CommonJS) stays entirely outside `tsconfig.app.json`, mirroring the existing `tsconfig.worker.json` precedent for a second narrow build target; see `electron/AGENTS.md` for the contextIsolation/sandbox/preload-bridge rule it documents. A new `angular.json` `electron` build configuration overrides `baseHref` to `/` and disables the service worker (unsupported/redundant outside a real HTTP(S) origin's normal lifecycle, and superseded by Stage 8's `electron-updater`); `PlatformService` ([Platform Service](../architecture/SYSTEM_ARCHITECTURE.md#platform-service)) also gates the service worker's runtime registration off under Electron as a second layer of defense. `npm run electron:dev` points Electron at a live `ng serve` for hot-reload development; `npm run electron:start` runs the full build → compile → launch path. Packaging (`electron-builder`, installers, CI) stays deferred to Stage 8, per plan.

Two bugs surfaced only through live app testing, not the unit suite or code review — consistent with the Phase 6 sandbox lesson that this class of issue needs real runtime verification:
1. `app.getAppPath()` resolves to the entry script's own directory (`dist/electron`), not the repo root, when Electron is launched with a direct file path (`electron dist/electron/main.js`) rather than a project directory — every request 404'd until the static server's root was resolved relative to `__dirname` instead.
2. The Python Playground's opaque-origin sandboxed iframe makes its dynamic `import()` of Pyodide's `.asm.mjs` a CORS-mode fetch even against a same-looking `http://127.0.0.1` origin — the same gotcha already documented for `ng serve` in the Phase 6 code-sandbox notes. The local static server needed its own `Access-Control-Allow-Origin` response header, the same fix GitHub Pages provides for free and `ng serve` needed added explicitly.

**Stage 2** replaced `ScannedFile`'s `File` reference with a source-agnostic `{path, read(): Promise<ArrayBuffer>}` shape, so `directory-tree-diff.ts`, `directory-diff.worker.ts`, and `git-diff-service.ts` needed zero changes for the native path to slot in alongside the unchanged web path. Directory Diff's native path still buffers eagerly (a native picker + fs walk, with a new Rescan action neither tool had before); Git Repo Browser instead got a new *lazy*, IPC-backed `isomorphic-git` `FsClient` (`git-native-fs-client.ts`) that reads on demand with no upfront buffering — more work than eager buffering, chosen deliberately for scalability on large repos, confirmed against `isomorphic-git`'s actual `PromiseFsClient` type rather than assumed.

**Stage 3** deliberately did *not* fold `secure-local` into `PersistenceService.signal()`'s synchronous model — Electron's `safeStorage` is async, so `SecureLocalService` is a standalone service with its own async `get`/`set`/`remove`, and `PersistenceService.signal()` throws defensively if `'secure-local'` is ever passed to it. Ships infrastructure only in isolation; Stage 4's Settings tool (since Milestone 476 the `/settings` shell destination, still under the same `settings` storage namespace) is its first real consumer.

**Stage 4** reuses `SecureLocalService` for *all three* LLM fields (base URL, model, API key), not just the key — even though base URL/model aren't secret, this means the main process can read the whole config through the one mechanism it already has, with no separate "push config to main" IPC call and no second on-disk store. The proxy is non-streaming by design (a dumb pass-through with auth injection) and lazily started on first use, restarted whenever the stored config changes. **Follow-up — Settings as a shell destination (Milestones 475–479):** Settings shipped here as a `developer`-category tool, which then needed special cases everywhere (excluded from the tool count, the README/SECURITY generators, and pipeline coverage; looked up by a hard-coded `getById('settings')` in `core/`). It is now a sanctioned shell destination (`src/app/shell/settings/`, exception #8 in `shell/AGENTS.md`), not a tool: `/settings/:section`, pinned to the sidebar footer, with a filterable sub-nav of six app-level sections (General, AI / LLM Provider, Hotkeys, Window & Updates, Files, Data & Privacy), an unsaved-changes guard, and per-section reset. The sidebar's separate "Clear all DUDE data" button now lives only in Data & Privacy. A "Tools" group is generated from an optional manifest `settingsSection`, so a tool contributes its own panel without touching `shell/` (Advanced Markdown Workspace's relay is the first), and `settingsSection.workspaceOverridable` lets saved workspaces override a declared tool preference. The web build lists desktop-only sections with a Desktop badge and an explainer. Entry points: the sidebar gear, File › Preferences (Ctrl+,), the tray's "Settings…", Ctrl+K "Settings" / "Settings: <section>", and `dude://open/settings[/<section>]`. The LLM fields keep the `dude:v1:settings:llm*` keys because `electron/llm-bridge.ts` reads them directly; `settings` is now a storage namespace, not a tool id. Scope ceiling: this is an app-preferences page plus a per-tool contribution point, not a general plugin-configuration system; tools still own their own in-tool options.

**Stage 5** moved `base64-codec.ts` and `hash-compute.ts` out of their tool folders into a new `src/shared-logic/` directory — the first precedent for `electron/` runtime-importing anything from outside itself (previously type-only). Closing the main window now hides it to the tray instead of quitting, a deliberate behavior change from Stage 1's `window-all-closed` → `app.quit()`. File watching shipped as infrastructure only at this stage. Phase 29 later added an opt-in, read-only auto-rescan to Directory Diff and Git Repo Browser, plus an explicit reload action for a selected changed file; this does not reload unsaved editor content.

**Stage 6** hand-rolled the `y-websocket` wire protocol (`y-protocols/sync` + `y-protocols/awareness` message framing over a plain `ws` WebSocket) rather than depending on `y-websocket` itself, whose package only exports the browser `WebsocketProvider` client under a resolvable subpath, not its server utility. This is also the one narrow, deliberate exception to every other Phase 8 backend's `127.0.0.1`-only rule: the collab server binds `0.0.0.0` (LAN reachability is the point), mitigated by a random per-session code required before a connection is accepted. A unit test simulating two paired clients (`markdown-collab-client.spec.ts`) caught a real duplication race before it ever ran live: if both sides of a fresh session tried to seed initial content, both texts got concatenated in CRDT-merge order. Fixed by making only the session *host* ever seed content — a *joiner* always starts empty and adopts whatever the host provides.

**Stage 7** factored the Yjs room logic out of `electron/collab-server.ts` into `collab-relay/room.ts`, shared with the new standalone `relay/` deployable, rather than duplicating the wiring twice. The relay supports multiple concurrent rooms keyed by the WebSocket URL path, each room's code established by its first connection's own client-generated `?code=` (the relay itself never issues codes — same pattern as the local server), torn down once its last participant leaves. Advanced Markdown Workspace's "Host via Relay" option connects directly to `<relayUrl>/<roomId>` with no Electron IPC involved, since relay-hosting is really just a specially-generated join. Verified with a real two-client WebSocket round-trip against a running relay instance, not only unit tests. The room/session identity model shipped is intentionally minimal — anonymous, client-generated room codes only; named-but-accountless participants (the richer half of the original open question) remains deferred.

**Stage 8** made versioning and release-cutting fully automatic rather than a manual decision: `package.json` started at `0.0.1`, and a new `version-bump.yml` workflow bumps the patch version and pushes a matching `vX.Y.Z` tag on **every** push to `master` — not just Electron-relevant commits — so every future commit, tool or framework, becomes a desktop release candidate; this was a deliberate, explicit choice made with the user, not an oversight. The tag push triggers a separate `release.yml` (Windows runner, its own `npm test` gate since the bump job itself runs unconditionally with no test gate) that runs `electron-builder` and publishes both an unsigned NSIS installer and an MSIX/appx package to the matching GitHub Release. The MSIX ships with **placeholder** Microsoft Store package-identity values (`electron-builder.yml`'s `appx` block) — it's real and sideloadable today, but not submittable to the Store until those are swapped for values reserved through a real Microsoft Partner Center account, which the project doesn't have yet. `electron-updater`'s `autoUpdater` only drives the NSIS install path (downloads a new release automatically in the background, installs only when the user clicks "Restart & Install" — never silently, mirroring the web build's existing update precedent); the MSIX path would update through the Store/App Installer's own infrastructure instead, out of scope here. A new `DesktopUpdateService` (`core/platform/`) mirrors the shape of the existing web-only `UpdateService` but stays fully separate — `update-badge.ts` is the only shared file, branching internally on `PlatformService.isDesktop()` so `shell-layout.html` needed no changes at all.

**Windows setup amendment (2026-09-25):** The GitHub Releases NSIS installer now offers Express presets and a Custom wizard for scope, location, shortcuts, Explorer integration, file-type candidacy, login launch, and update policy. A separate resumable in-app wizard configures desktop preferences, updates and notifications, hotkeys, optional AI credentials, and collaboration. Manual installer runs repeat setup with saved choices; silent updates keep those choices and remain noninteractive. Windows Default Apps requires user confirmation for file defaults. Explorer file/folder launches route through a single desktop instance, and imported code or HTML requires an explicit action before execution or preview. The MSIX keeps its Windows-managed installation flow. See `docs/WINDOWS_SETUP.md` for behavior and verification.

---

**Platform note for Phases 9–20:** these shipped phases are dominated by parsing, formatting, computation, encoding, generation, and upload/inspect workflows that fit the browser sandbox and therefore remain available through the web companion wherever their dependencies permit it. Phase 8 established the native desktop foundation, and Phase 21 established the shared workflow foundations. From Phase 22 onward, each capability simply declares the platforms it supports: DUDE Desktop is canonical, DUDE Web is the zero-install browser-safe companion, and shared logic is reused wherever the platform allows it.

References inside Phases 9–20 to browser-safe versus native-only variants are therefore historical implementation context, not present-tense roadmap gates. Where those references describe later live/native work, they point to the corresponding unified roadmap phase instead.

<a id="phase-9"></a>

## Phase 9 — Structured Data Depth

**Status:** ✅ Complete

Goal: extend the Data category with power-tools and additional format support beyond the core JSON/YAML/XML/CSV converters already shipped. **Achieved** — all 34 items shipped as Milestones 39–72, each its own tool commit. Notable deviations from the plan as originally written: the Avro Viewer (#31) hand-rolls the Object Container File decoder instead of using `avsc` — `avsc`'s own "browser" build still requires Node built-ins (`stream`/`util`/`path`) that fail to bundle without extra polyfill configuration this repo doesn't otherwise carry, so it's kept only as a devDependency for cross-checking the wire format during development. The Universal Structured Data Converter (#1) ended up calling the same underlying libraries (`js-yaml`, `fast-xml-parser`, `papaparse`, `smol-toml`) directly rather than importing sibling tools' logic as originally envisioned, since TOML Formatter/XML Formatter/YAML ↔ JSON Converter's actual exports (reformat-only, or direction-keyed rather than parse/stringify) weren't a clean fit to reuse as-is. The seven binary-format viewers (#27–33) share one new shared primitive, `app-binary-format-viewer` (file drop + tree/table result view).

1. Universal Structured Data Converter — single workbench converting between JSON, YAML, XML, TOML, and CSV
2. TOML Formatter / Validator
3. INI Formatter / Parser
4. Properties File Parser
5. JSON Flatten / Unflatten
6. JSON Merge
7. JSON Patch Generator
8. JSON Patch Tester
9. JSON Pointer Tester
10. JSON Sort Keys
11. JSON Lines / NDJSON Viewer
12. CSV ↔ SQL Converter (INSERT statement generation both directions)
13. CSV Delimiter Detector
14. CSV Column Statistics
15. CSV Cleaner
16. CSV Deduplicator
17. CSV Join / Merge
18. CSV Pivot
19. CSV Filter / Sort
20. XML XPath Tester
21. XML Schema / XSD Validator
22. XML ↔ CSV Converter
23. YAML Linter
24. YAML Merge
25. YAML Anchor / Alias Visualizer
26. YAML Path Tester
27. Protobuf Decoder (upload a `.proto` + payload)
28. MessagePack Decoder
29. BSON Viewer
30. CBOR Viewer
31. Avro Viewer
32. Parquet Viewer
33. SQLite File Viewer (read-only, uploaded `.sqlite` file — distinct from a *live* database connection, which is covered by the later Database Toolkit in Phase 33)
34. Resx file parser / viewer / diff / merge / token extractor

<a id="notes-5"></a>

### Notes

Large JSON Streaming Viewer and JSON Table Viewer extend the existing JSON Formatter's Tree view ([Initial Showcase Tool Set](#initial-showcase-tool-set)) rather than becoming separate tools. `sql.js` (SQLite compiled to WASM) is the natural library for #33, consistent with the library-forward dependency philosophy ([Dependency Philosophy](../architecture/SYSTEM_ARCHITECTURE.md#dependency-philosophy)); TOML support (#1, #2) uses `smol-toml`; the XSD Validator (#21) uses `xmllint-wasm` (libxml2 compiled to WebAssembly). Both `sql.js` and `xmllint-wasm` needed an explicit build-time asset copy plus a service-worker cache-manifest entry (mirroring Pyodide's existing pattern in [Phase 8](#phase-8)) — neither library's own bundler-asset-detection worked out of the box against this app's esbuild-based build, and `sql.js`'s browser build resolves to a differently-named `.wasm` file than its Node build, only caught via real end-to-end browser testing rather than unit tests.

<a id="phase-10"></a>

## Phase 10 — Text Processing Depth

**Status:** ✅ Complete

Goal: extend the Text category with a full Unicode/line-manipulation toolkit and deeper text analysis than Text Inspector currently covers.

**Achieved (Milestones 73-91, plus 4 Advanced Diff/Merge enhancement milestones):** the original 40-item list was consolidated to 19 new/extended tools plus the 6 originally-planned Advanced Diff enhancements, merging closely-related line/character operations into single tools with an internal mode selector, dropping the item already covered by an existing tool, and reinterpreting one item that didn't map onto a paste-based (non-editor) tool:

1. Unicode Character Inspector
2. Unicode Code Point Converter
3. Invisible/Control/Zero-Width Character Scanner (consolidates the original Invisible Character Viewer, Control Character Viewer, and Zero-Width Character Detector into one scan pass)
4. ASCII Table
5. Unicode Table
6. Unicode Normalization (NFC / NFD / NFKC / NFKD)
7. Smart Quotes Normalizer
8. Whitespace Cleaner extension: Line Ending Converter, Tabs ↔ Spaces, Indentation Converter (enhancement to the existing Whitespace Cleaner / Normalizer tool, [Initial Showcase Tool Set](#initial-showcase-tool-set) — not a new tool)
9. Duplicate Finder (Lines | Words modes — consolidates the original Duplicate Line Remover, Duplicate Word Detector, and Unique Lines)
10. Line Order Tools (Sort / Shuffle / Reverse modes)
11. Line Prefix/Suffix & Numbering (Prefix/Suffix | Add/Remove Line Numbers | Per-Line Transform modes — the Per-Line Transform mode reinterprets the original "Multi-Cursor Text Transformer," which doesn't map onto a paste-based tool with no real multi-cursor editor)
12. Extract Columns
13. Find & Replace (plain text)
14. Lorem Ipsum & Placeholder Text Generator
15. ASCII Art Generator / Banner
16. Keyword Frequency Analyzer
17. String Similarity Calculator (Levenshtein, Jaro-Winkler)
18. Soundex / Metaphone
19. Text Tokenizer & N-Gram Generator

**Dropped from this phase:** Regex Find/Replace — already covered by the existing Regex Tester's replace mode ([Initial Showcase Tool Set](#initial-showcase-tool-set)).

**Advanced Diff / Merge enhancements (items 35-40 of the original list)** all shipped as 4 incremental milestones enhancing the existing tool ([Initial Showcase Tool Set](#initial-showcase-tool-set)) rather than new tools:

20. Ignore-whitespace / ignore-line-endings / ignore-case options (also threaded through the three-way merge path)
21. Semantic JSON/YAML/XML diff modes — one shared structural-diff engine (`fast-json-patch`'s `compare()`), three parser front-ends
22. Moved-block detection — exact-match pairing of remove-only/add-only hunks, purely informational
23. Image diff mode — pixel-level comparison via `pixelmatch`, fully separate payload/worker since images are a different data type from the rest of the tool

<a id="notes-6"></a>

### Notes

Language Detector and Readability Analyzer already shipped ([Phase 7](#phase-7)); Text Statistics already ships on Text Inspector.

<a id="phase-11"></a>

## Phase 11 — Encoding & Numeric Representation Lab

**Status:** ✅ Complete

Goal: turn Encoding into a full representation/conversion laboratory and give Developer a programmer-calculator suite.

**Achieved (Milestones 92-109):** the original 43-item list was consolidated to 18 shippable tools during planning, merging closely-related conversions into a single tool with an internal mode selector wherever the items were clearly variations on one underlying transform:

1. Hex ↔ Text Converter (consolidates Hex Encoder/Decoder, ASCII ↔ Hex, UTF-8 ↔ Hex, and UTF-16 ↔ Hex into one mode-selectable tool)
2. Base-N Encoder / Decoder (consolidates Binary Encoder/Decoder and Base16/32/36/58/62/85/91 into one mode-selectable tool)
3. ROT13 / ROT47 Cipher
4. Punycode Converter (placed in Web, alongside the existing URL/URI tools, rather than Encoding)
5. Escape / Unescape Toolkit (consolidates JavaScript, CSS, SQL, Shell, PowerShell escaping, and Quoted-Printable into one mode-selectable tool)
6. URL Percent-Encoding Inspector (placed in Web)
7. Data URI Converter (consolidates Data URI Generator and Data URI Decoder)
8. Hex Dump Viewer / Builder (consolidates File → Hex Dump and Hex Dump → File; Worker-optional above a size threshold)
9. Numeric Representation Inspector (consolidates Endianness Converter, IEEE-754 Floating Point Inspector, and Integer Representation Inspector)
10. Programmer Calculator (consolidates Two's Complement Calculator, Bitwise Calculator, and the original Programmer Calculator item, with an interactive bit-grid visualization)
11. Arbitrary Precision Calculator (the original Arbitrary Precision / BigInt Calculator item)
12. Scientific Notation Converter
13. Percentage & Ratio Calculator (consolidates Percentage Calculator and Ratio Calculator)
14. Number Theory Toolkit (consolidates Modular Arithmetic, GCD / LCM, and Prime Checker / Factorization)
15. Range Generator
16. Statistics Calculator (mathjs-powered)
17. Matrix Calculator (mathjs-powered; Worker-optional above a cell-count threshold)
18. Expression Evaluator (mathjs-powered sandboxed expression parser, not JavaScript `eval`)

<a id="notes-7"></a>

### Notes

Base64/Base64URL, JSON Escape/Unescape, and Unicode Escape/Unescape already ship. This phase absorbs the source doc's separate "Numbers & Mathematics" section rather than opening a new category — everything here fits Encoding, Web, or Developer without a taxonomy change. Three new dependencies were added: `mathjs` (Statistics/Matrix/Expression tools), `base-x` (Base36/58/62), and `rfc4648` (RFC-conformant Base32) — plus `punycode` for the Punycode Converter. Base85/ASCII85 and basE91 are hand-rolled, since no well-maintained package implements either's bit-chunked spec.

<a id="phase-12"></a>

## Phase 12 — Security, Cryptography & Certificate Depth

**Status:** ✅ Complete

Goal: extend Security with the hashing/encryption/key-generation/certificate-inspection tools that don't require a live network fetch.

**Achieved (Milestones 110-122):** the original 26-item list was consolidated to 12 new tools plus one extension of the existing Hash Generator, merging items that are the same underlying operation shown different ways (e.g. PEM Inspector + DER Inspector + PEM ↔ DER Converter) into one tool with an internal mode/format selector:

1. Hash Generator, extended (items 1: SHA-3/BLAKE2/BLAKE3 via `@noble/hashes`, xxHash32/64 via `xxhash-wasm`, hand-rolled CRC32/CRC64)
2. HMAC Generator (item 2)
3. Password / Passphrase Generator (items 3-4, one tool with a mode toggle)
4. Password Strength & Entropy Analyzer (items 5-6; hand-rolled entropy/heuristics, not zxcvbn — its dictionary data is a worse lazy-chunk cost than node-forge for no reuse elsewhere)
5. AES Encrypt / Decrypt (item 7; native Web Crypto AES-GCM/AES-CBC with a PBKDF2-derived key)
6. ChaCha20-Poly1305 Encrypt / Decrypt (item 8; `@noble/ciphers`, since Web Crypto has no RFC 8439 support — defaults to XChaCha20-Poly1305)
7. Asymmetric Key Generator (items 9-11: RSA/EC/Ed25519, one tool with a family/curve/modulus-length picker, native `crypto.subtle` via `jose`)
8. PEM / DER Inspector & Converter (items 12-13, 25; introduces the shared `asn1-tree.ts` ASN.1-to-presentation-tree translator and the `node-forge` dependency)
9. CSR Generator & Inspector (items 14-15; RSA-only — `node-forge` has no EC/Ed25519 CSR-signing support)
10. SSH Key Generator & Inspector (items 16-18; hand-rolled OpenSSH wire-format encode/decode in `ssh-wire-format.ts`, no library — cross-validated against real `ssh-keygen` output)
11. X.509 Certificate Inspector (items 19, 21-23, as tabs: Overview/validity, one-shot expiration status, SAN, extensions, SHA-1/SHA-256 fingerprints; introduces the shared `x509-fields.ts` extractor)
12. Certificate Chain Viewer & Builder (items 20, 26; DN-matching as an ordering heuristic, `forge.pki.verifyCertificateChain` as the real verification; cross-validated against an `openssl`-built chain)
13. PKCS#12 / PFX Inspector (item 24; the PKCS12 password is `'none'`-persistence, no exceptions — the phase's single most sensitive input)

<a id="notes-8"></a>

### Notes

Web Crypto API covers AES/RSA/EC/Ed25519 generation and SHA-family hashing/fingerprinting natively; `node-forge` is the fallback for ASN.1/PEM/DER/X.509/CSR/PKCS#12 handling per the library-forward philosophy ([Dependency Philosophy](../architecture/SYSTEM_ARCHITECTURE.md#dependency-philosophy)), added to `angular.json`'s `allowedCommonJsDependencies` in Milestone 117. Every hand-rolled or forge-based crypto path (SSH wire format, X.509 fingerprints, PKCS#12 decryption) was cross-validated in its unit tests against real, independent tool output (`ssh-keygen`, `openssl`) rather than only against itself. Live TLS handshake fetching (cipher/ALPN/SNI inspection, expiration *monitoring* over time) needs live socket/network access and **shipped in Phase 28** as the TLS Connection Inspector, Live Certificate Chain Fetcher and Certificate Watch List; those tools hand a live-fetched chain back to these Phase 12 file-based tools for detailed inspection.

<a id="phase-13"></a>

## Phase 13 — Auth & JWT Depth

**Status:** ✅ Complete

Goal: go beyond decode/sign/verify into the surrounding OAuth/OIDC tooling developers need, all operating on user-pasted tokens/URLs rather than live flows.

**Achieved (Milestones 123-136):** all 14 items shipped as their own tool, one-to-one with the original list:

1. JWKS Viewer (item 1; enumerates a pasted JWKS document's keys, flags missing/duplicate `kid`s and other structural issues)
2. JWKS → Public Keys (item 2; converts each JWK to SPKI PEM via `jose`)
3. JWT Claims Analyzer (item 3; claim-level lint — `alg:"none"`, expired/missing `exp`, missing recommended claims)
4. JWT Expiration Visualizer (item 4; iat/nbf/exp timeline with a percent-elapsed bar)
5. OAuth Token Inspector (item 5; auto-detects JWT-shaped vs opaque access/refresh/ID tokens)
6. OAuth 2.0 Playground (item 6; every grant type — Authorization Code, PKCE, Client Credentials, Resource Owner Password, Device Authorization, Implicit, Refresh Token — as build/inspect request and response panels)
7. OpenID Connect Discovery Document Inspector (item 7; validates a pasted discovery document against OIDC Discovery 1.0's required/recommended fields)
8. PKCE Generator (item 8; RFC 7636 code_verifier/code_challenge, CSPRNG-generated)
9. PKCE Verifier (item 9; round-trip verifier-to-challenge validation)
10. OAuth Scope Parser (item 10; splits/dedupes a scope string, annotates well-known OIDC and vendor scopes)
11. Basic Auth Header Generator (item 11; standard-Base64 `Authorization: Basic`, encode and decode)
12. Bearer Token Builder (item 12; RFC 6750 `Authorization: Bearer` formatting with charset validation)
13. AWS Signature V4 Inspector (item 13; hand-rolled canonical-request/string-to-sign/HMAC-SHA256 chain, both inspect-and-verify and build-from-scratch modes — shipped under `web`, not `security`, since it's fundamentally an HTTP request-signing protocol tool, matching the cURL/HTTP Header Inspector precedent)
14. HTTP Digest Auth Helper (item 14; RFC 7616/2617 HA1/HA2/response chain, MD5 and SHA-256, `qop=auth`/`auth-int`/legacy and `-sess` variants — shipped under `web` for the same reason as item 13)

<a id="notes-9"></a>

### Notes

JWKS fetching-by-URL already ships on the JWT Signature Verifier ([Initial Showcase Tool Set](#initial-showcase-tool-set)); every Phase 13 tool operates on pasted/uploaded material instead, so no new network policy was introduced. AWS SigV4 and HTTP Digest Auth were hand-rolled rather than adding a new dependency (no `aws4`/AWS SDK existed in the project), cross-validated in their unit tests against independently computed reference chains (an AWS-documented worked example for SigV4; the classic RFC 2617 example for Digest Auth) rather than only self-consistency round-trips — the same posture Phase 12 used for its hand-rolled SSH/crypto paths.

<a id="phase-14"></a>

## Phase 14 — Date & Time Depth

**Status:** ✅ Complete

Goal: round out Date & Time with additional parsers and time-math utilities beyond timestamp conversion, timezones, duration, and cron.

**Achieved (Milestones 137-143):** the original 15 items consolidated into 6 new tools plus one bundled enhancement to two existing tools, per the design already anticipated by this phase's own Notes below:

1. Week Number Calculator (items 7+8; one bidirectional tool — date → ISO week-year/week/weekday and back — rather than two one-direction tools, matching this codebase's existing bidirectional-tool pattern, e.g. Base64 Encoder/Decoder)
2. DST Transition Explorer (item 6; day-by-day offset scan + binary search, hand-rolled since no library exposes transition instants directly — the scan itself lives in a new shared `shared/utils/dst-transitions.ts` since Timezone Offset Comparator needs the same data)
3. Timezone Offset Comparator (item 5; a year-long offset grid across multiple zones *and* a pairwise ahead/behind calculator with next-change lookahead, both in one tool — the existing Date/Timezone Converter already covered a single moment's per-zone offset, so this had to do something that tool didn't)
4. Relative Time Parser (item 9; bidirectional — free text to timestamp via a new `chrono-node` dependency, since natural-language date parsing is exactly the "genuinely fiddly" case that justifies a library per [Dependency rule](../architecture/SYSTEM_ARCHITECTURE.md#dependency-rule); timestamp back to text via the native `Intl.RelativeTimeFormat`)
5. Stopwatch & Countdown (items 11+12; one tool with a mode toggle — the first real-time-ticking UI in the codebase, anchored on persisted start/target instants rather than a raw ticking counter so a reload mid-run resumes correctly)
6. Epoch Timeline Visualizer (item 13; a free list of labeled timestamps *and* a start/end range, both modes plotted through a new shared `shared/components/timeline/` primitive)
7. Unix Timestamp Converter + Cron Expression Parser enhancement (items 1-4 and 14-15, bundled into one milestone since neither is a new tool): Unix Timestamp Converter gained ISO 8601/RFC 3339/RFC 2822 auto-detected string input (`luxon`'s `fromISO`/`fromRFC2822`) and BigInt-backed microsecond/nanosecond units; Cron Expression Parser gained a previous-runs list (`cron-parser`'s already-available `prev()`), a next/previous direction toggle, verbose `cronstrue` humanization, and a 25-run option

Item 10 (Duration → ISO 8601) needed no work: the existing Duration Parser/Formatter already accepted human-or-ISO-8601 input and always returned an `iso8601` field in its result.

<a id="notes-10"></a>

### Notes

`luxon` already covers most of the parsing/timezone math per Phase 4; items 1-3 and 14-15 extended the existing Cron Parser / Unix Timestamp Converter rather than becoming new tools, per the plan above.

<a id="phase-15"></a>

## Phase 15 — Web & HTTP Depth

**Status:** ✅ Complete

Goal: deepen the Web category's URL/header/request tooling and broaden cURL's language coverage, all construct-and-display rather than send-a-real-request.

**Achieved (Milestones 144-160):** the original 24 items consolidated into 12 new tools and 5 enhancements to existing tools, with 2 items needing no work and 1 cut outright:

1. URL/URI Inspector — URI Component Visualizer enhancement (item 3; colorized scheme/userinfo/host/port/path/query/fragment breakdown view via a new RFC 3986 [V1 Scope in One Sentence (Delivered)](DECISION_LOG.md#v1-scope-in-one-sentence-delivered) segmenter; items 1-2, URL Parser and URL Builder, needed no work since this tool already parses, edits, and round-trips every part)
2. URL Normalizer & Comparator (items 4-6; new tool, three modes — Normalize, Resolve, Compare — sharing one RFC 3986 [Usage pattern](../DUDE_PRD.md#usage-pattern) normalization core)
3. URL Safety Inspector (item 7; new tool; heuristic checks — userinfo-before-host, IP-literal hosts, mixed-script IDN homograph risk, commonly-abused TLDs, deep subdomain chains — worded as signals, not verdicts)
4. Punycode Converter — Inspect mode (item 8; enhancement adding a per-label script breakdown, reusing item 7's homograph-detection util as its second consumer)
5. HTTP Request Builder / Converter (items 9+22; new tool — build from fields or parse a pasted raw HTTP/1.1 request, export as cURL or any cURL-converter language target)
6. HTTP Response Viewer (item 10; new tool; first producer of the reserved `http-response` `DudeDataType`)
7. Cookie Tools (items 11-12; new tool, Cookie/Set-Cookie mode toggle, with Set-Cookie mistake warnings)
8. Accept Header Builder (item 13; new tool)
9. Cache-Control Builder (item 14; new tool, separate request/response directive sets)
10. CSP Builder (item 15; new tool, 18 known directives, weakening-combination warnings)
11. CORS Header Builder (item 16; new tool, plus a hypothetical-request preflight evaluator)
12. Content-Disposition Builder (item 17; new tool, RFC 5987 `filename*` encoding for non-ASCII filenames)
13. Range Header Builder (item 19; new tool, request Range and response Content-Range)
14. Unix Timestamp Converter — HTTP-date support (item 20; enhancement to the existing date-time tool rather than a new web-category one, since it's the same date-parsing surface)
15. cURL Command Inspector/Converter — 7 more language exports (item 21; enhancement — Python (httpx), Kotlin (OkHttp), Rust (reqwest), PHP (cURL), Ruby (net/http), Dart (http), Swift (URLSession))
16. Multipart Form Data Builder (item 23; new tool, file parts shown as a binary-data placeholder)
17. Query String Parser/Builder — request-body framing (item 24; enhancement, a "Copy as request body" action reusing the existing codec)

Item 18 (Authorization Header Builder) was cut: Basic Auth Header Generator, Bearer Token Builder, HTTP Digest Auth Helper, and AWS Signature V4 Inspector already cover Basic/Bearer/Digest/AWS4 between them, so a general-purpose builder would only duplicate four more-capable existing tools.

<a id="notes-11"></a>

### Notes

Two new `shared/` extractions followed the "extract when a second tool needs it" pattern already established in Phase 14: `shared/utils/url-homograph.ts` (mixed-script detection via native `\p{Script=...}` regex property escapes, the same technique `unicode-general-category.ts` uses) serves URL Safety Inspector and Punycode Converter's Inspect mode; `shared/http-request/` (relocated from `tools/curl-converter/`: the canonical `ParsedHttpRequest` model, `curl-build.ts`, and every `export/` language generator) serves cURL Command Inspector/Converter and the new HTTP Request Builder/Converter, which gets every export-language target "for free." `shared/utils/http-status-codes.ts` (relocated from HTTP Status Code Reference) similarly now serves HTTP Response Viewer's status-line lookup.

Item 21's original 12-language list (C#, Python requests, Python httpx, Java HttpClient, Kotlin, Go, Rust, PowerShell, PHP, Ruby, Dart, Swift) turned out to overlap the existing 8 shipped languages in 5 places (C#, Python requests, Java HttpClient, Go, PowerShell already shipped pre-Phase-15) — only the 7 genuinely new targets needed writing.

CORS Header Builder was planned to extract CSP Builder's directive/source-list row editor into a shared component (the anticipated "second consumer" moment), but building it revealed the shapes don't actually converge: CSP's values are space-separated multi-directive lists, CORS's Allow-Methods/Allow-Headers are single comma-separated fields. Each tool kept its own hand-rolled UI rather than force a shared abstraction that wouldn't meaningfully reduce duplication.

<a id="phase-16"></a>

## Phase 16 — Regex Depth

**Status:** ✅ Complete

Goal: extend Regex Tester with visualization and benchmarking beyond the existing explainer/flavor-notes/replace features ([Phase 7](#phase-7)).

**Achieved (Milestones 161-164):** all 4 items shipped as their own tool, one-to-one with the original list:

1. Regex Visualizer (item 1; railroad diagram, built by walking the same regexp-tree AST node types regex-explain.ts already walks and mapping them to a new `railroad-diagrams` dependency's Diagram/Sequence/Choice/Terminal primitives — real DOM SVG output with built-in HTML-entity escaping, verified via a dedicated XSS-safety spec case)
2. Regex Benchmark (item 2; a static heuristic AST scan for the two classic catastrophic-backtracking shapes — nested unbounded quantifiers, an unbounded quantifier around alternation — plus live per-sample timing, one worker per sample rather than one worker looping all samples, so a hung sample only costs that one job)
3. Regex Flavor Converter (item 3; JS/Python/Java/.NET/PCRE/Go RE2, via a small named-group/backreference syntax normalization pass ahead of regexp-tree's JS-only parser, then a per-target-flavor AST-to-string emitter; a construct the target can't represent at all is still emitted with a disclosed warning, never silently dropped)
4. Regex Generator (item 4; non-AI, heuristic, offline — run-length character-class tokenization with self-validation against every example/counter-example before a pattern is ever shown; the already-shipped Phase 8 Stage 4 AI-based natural-language-to-regex feature is untouched and distinct from this)

<a id="notes-12"></a>

### Notes

`regexp-tree`'s existing AST ([Phase 7](#phase-7)) was the shared front end for three of the four tools (Visualizer, Benchmark's static heuristic, Flavor Converter), exactly as anticipated. `shared/utils/regex-ast-features.ts` (relocated from `regex-flavor-notes.ts`'s `detectFeatures()`) is a new "extract on second consumer" shared util, the same pattern used throughout Phase 15 — the Flavor Converter needed it to warn when a target flavor can't represent a construct the source uses.

The `railroad-diagrams` npm package (real npm package, zero dependencies, CC0) turned out to interop cleanly through esbuild via `allowedCommonJsDependencies` (confirmed with a real install + `ng build`) rather than needing the `ejs`-style static-asset-copy workaround that was anticipated as a real risk going in.

The Benchmark tool's live-timing design changed from the plan's original one-worker-loops-all-samples idea: the shared worker protocol's `progress` channel turned out to be a plain number with no room for a rich per-sample payload, so a hung sample would have silently lost every already-completed sample's timing along with it. Dispatching one isolated, independently-cancelable worker per sample avoids that entirely, at the cost of more worker-spawn overhead per run.

<a id="phase-17"></a>

## Phase 17 — Design, Markup & Media Tools

**Status:** ✅ Complete

Goal: grow Color Converter into a full design toolkit and add CSS/HTML/image/QR tools, all File-API/canvas-based with no OS access required.

**Achieved (Milestones 165-205):** all 40 items shipped, one-to-one with the original list:

1. Color Converter: LAB/LCH/HWB via colord's own plugins, OKLAB/OKLCH via a hand-rolled Ottosson-matrix conversion (Milestone 165)
2. Contrast Checker / WCAG Compliance Checker (Milestone 168)
3. Palette Generator (Milestone 166)
4. Gradient Generator (Milestone 167)
5. Color Blindness Simulator — Machado 2009 matrices, canvas pixel transform on an uploaded image (Milestone 169)
6. Tailwind Color Matcher (Milestone 170)
7. CSS Formatter / Minifier — hand-rolled tokenizer/reprinter (Milestone 173)
8. CSS Specificity Calculator / Comparer — via the `specificity` package (Milestone 171)
9. CSS Selector Tester (Milestone 172)
10. Flexbox Playground (Milestone 180)
11. CSS Grid Playground (Milestone 181)
12. Box Shadow Generator (Milestone 175)
13. Border Radius Generator (Milestone 176)
14. CSS Transform Builder (Milestone 178)
15. CSS Animation Builder (Milestone 179)
16. Cubic-Bezier Editor (Milestone 177)
17. HTML Formatter / Minifier (Milestone 182)
18. DOM Tree Viewer (Milestone 183)
19. HTML ↔ JSX Converter (Milestone 185)
20. HTML Entity Explorer (Milestone 184)
21. Meta Tag Generator (Milestone 186)
22. OpenGraph Preview (Milestone 187)
23. Structured Data / JSON-LD Tester (Milestone 188)
24. Markdown Table Formatter — a `toolbar-action` plugin on Advanced Markdown Workspace (Milestone 189)
25. Markdown Linter — a new findings panel on Advanced Markdown Workspace (Milestone 190)
26. Markdown Link Checker — a new findings panel plus a manual "Check links" liveness check, the third `docs/SECURITY.md` network exception (Milestone 191)
27. Image Metadata Inspector (Milestone 193)
28. EXIF Viewer / Cleaner — via `exifr` (Milestone 194)
29. Image Format Converter (PNG ↔ JPEG ↔ WebP ↔ AVIF, AVIF feature-detected) (Milestone 197)
30. Image Compressor (Milestone 198)
31. Image Resizer (Milestone 195)
32. Image Cropper (Milestone 196)
33. Base64 Image Viewer (Milestone 192)
34. SVG Viewer / Formatter / Optimizer — via `svgo`'s browser build (Milestone 199)
35. SVG ↔ Data URI (Milestone 200)
36. Pixel Color Picker — upload-image mode only (historically browser-extensible); the live-screen variant requires native screen access and is tracked at Phase 35 item 6 (Milestone 201)
37. QR Code Generator (URL, Wi-Fi, contact, TOTP presets) — via `qrcode` (Milestone 202)
38. QR Code Scanner (from an uploaded image or webcam frame) — via `jsqr`, introducing the shared `camera-capture` primitive (Milestone 203)
39. Barcode Generator — via `jsbarcode`, with GS1 check-digit validation for EAN-13/EAN-8/UPC-A (Milestone 204)
40. Barcode Reader — via `@zxing/library`, reusing `camera-capture` (Milestone 205)

<a id="notes-13"></a>

### Notes

Milestone 174 (between Tailwind Color Matcher and Box Shadow Generator) built the `css-preview-sandbox` shared primitive — a sandboxed-iframe live-preview component, modeled on HTML Preview's iframe+CSP pattern but locked down further (no `allow-scripts` at all, since these tools render CSS only, never user script) — that all seven CSS live-preview tools (items 10-16) share. It's a framework-layer milestone with no numbered item of its own, the same pattern Milestone 16's `regex-ast-features.ts` extraction used.

Item 30 (Image Compressor) deviates from this section's original plan: a real WASM codec (`@jsquash/jpeg`/`webp`/`png`, the maintained successor to `@squoosh/lib`) was implemented first, but its Emscripten `locateFile` resolution breaks once Angular's esbuild-based production build bundles the codec module — the `.wasm` binary never made it into `dist/`, a defect only a real `ng build` caught, not the unit test suite. Image Compressor ships on plain `canvas.toBlob()` quality-based compression instead: real but more modest size reduction, zero bundling risk. Items 27–29, 31-32, and 34-35 (the rest of the image/SVG tools) all shipped as originally planned, since none of them needed a WASM codec.

Items 38 and 40 (QR Code Scanner, Barcode Reader) are the first `getUserMedia`/camera-API use anywhere in the codebase; `docs/SECURITY.md` gained a new "Camera access" section documenting it, alongside the network-exception entry item 26 added.

<a id="phase-18"></a>

## Phase 18 — Code Generators & Developer References

**Status:** ✅ Complete

Goal: ship the model-from-JSON generators (one of the highest-value additions per the source roadmap) and round out static developer references.

**Achieved (Milestones 206-216):** all 29 items shipped, one-to-one with the original list:

1. TypeScript Interface from JSON — one `model-generator` tool covers items 1-9 (Milestone 206)
2. C# Model from JSON (Milestone 206)
3. Java Class from JSON (Milestone 206)
4. Kotlin Data Class from JSON (Milestone 206)
5. Swift Codable Model from JSON (Milestone 206)
6. Python Dataclass from JSON (Milestone 206)
7. Rust Struct from JSON (Milestone 206)
8. Go Struct from JSON (Milestone 206)
9. SQL Schema (CREATE TABLE) from JSON (Milestone 206)
10. Dev Snippets Reference (searchable: HTTP headers, regex syntax, git/docker commands, PowerShell/Bash, SQL, CSS, HTML, Unicode, MIME types, cron syntax, chmod) (Milestone 207)
11. chmod / Unix Permissions Converter (`rwxr-xr--` ⇄ `754` with a visual owner/group/other checkbox grid) (Milestone 208)
12. Stack Trace Formatter / Parser (auto-detect framework) — one `stack-trace-formatter` tool covers items 12-16 (Milestone 209)
13. Java Exception Formatter (Milestone 209)
14. .NET Exception Formatter (Milestone 209)
15. JavaScript Stack Trace Formatter (Milestone 209)
16. Python Traceback Formatter (Milestone 209)
17. Error Code Reference: Windows error codes / Win32 errors / HRESULT (with a universal search, e.g. `0x80070005` → `E_ACCESSDENIED`) — one `error-code-reference` tool covers items 17-22 (Milestone 210)
18. Error Code Reference: POSIX errno (Milestone 210)
19. Error Code Reference: Linux signals (Milestone 210)
20. Error Code Reference: SQL Server / PostgreSQL SQLSTATE / MySQL error codes (Milestone 210)
21. Error Code Reference: TLS alerts (Milestone 210)
22. Error Code Reference: DNS response codes (Milestone 210)
23. Compression Lab: gzip / deflate via the native Compression Streams API (Milestone 211)
24. ZIP / TAR / TAR.GZ archive create / extract (Milestone 212)
25. Dependency Version Comparator (Milestone 213)
26. Semantic Range Evaluator (`^1.2.3`, `~1.2.3`, `>=1.2 <2` against a version) — folded into the pre-existing Semantic Version Comparator's Range Check tab, no separate tool needed (Milestone 214)
27. SemVer Range Visualizer — shipped as a new "Visualize" tab on the same Semantic Version Comparator (Milestone 214)
28. package-lock.json / pnpm-lock.yaml / yarn.lock Inspector (Milestone 215)
29. npm / PyPI / crates.io / NuGet Package Metadata Inspector — requires `fetch` to the relevant public registry; flagged `networkRequired`, same pattern as the existing JWKS-fetch and grammar-check tools ([Initial Showcase Tool Set](#initial-showcase-tool-set), [Phase 5](#phase-5)/7) (Milestone 216)

<a id="notes-14"></a>

### Notes

Item 23 (Compression Lab) shipped without Brotli/zstd: the Compression Streams API (the dependency-minimal, native-first choice per `/AGENTS.md`) only exposes `gzip` and `deflate` codecs in-browser: Brotli and zstd have no equivalent native API and would have required a WASM dependency for a comparison feature, so the item shipped narrower than originally scoped rather than pulling one in.

Items 26 and 27 (Semantic Range Evaluator, SemVer Range Visualizer) were both absorbed into the Milestone 14 Semantic Version Comparator (`semver-comparator`) instead of becoming a new `dependency-version-comparator`-style tool: its existing Range Check tab already handled compound ranges, and the Visualize tab was a small, natural addition to the same tool rather than a separate one.

Item 29 (Package Metadata Inspector) covers npm, PyPI, crates.io, and NuGet — Maven was dropped from the original five-registry list; Maven Central's search API doesn't expose a comparable single-package metadata endpoint without XML POM parsing, judged not worth the added complexity for this item.

Item 24 (Archive Creator / Extractor) used `fflate` for ZIP and a hand-rolled USTAR reader/writer plus the native Compression Streams API for TAR/TAR.GZ, rather than a single archive library, matching the dependency-minimal-by-default rule (`/AGENTS.md`).

<a id="phase-19"></a>

## Phase 19 — IDs, Mock Data & Git/SQL/Container Config Tooling

**Status:** ✅ Complete

Goal: broaden ID generation, turn Random Data Generator into a schema-driven mock-data studio, and add text/config-level Git, SQL, Docker/Kubernetes, and `.env` tooling that doesn't touch a live daemon, cluster, or database connection.

**Achieved (Milestones 217-265):** all 48 items shipped, plus one framework-layer milestone (a shared `diff-view` primitive extracted to `src/app/shared/components/`, Milestone 240, consumed by items 24, 29, 37, and 39):

1. UUID v1, v3, v6, v7 (v4 and v5 already ship) — inspect the embedded timestamp on time-based versions — extended the existing `uuid` tool rather than a new one; v1 and v7 already shipped pre-Phase-19, so only v3/v6 plus v6/v7 timestamp decoding were net-new (Milestone 217)
2. ULID Generator / Inspector (Milestone 218)
3. NanoID Generator (Milestone 219)
4. Snowflake ID Generator / Inspector — hand-rolled bit-packing (no npm package fits every vendor's epoch/bit-width variant) (Milestone 220)
5. CUID Generator (Milestone 221)
6. KSUID Generator / Inspector — hand-rolled rather than depending on the `ksuid` npm package, which hard-requires Node's `crypto`/`Buffer` globals with no browser build (Milestone 222)
7. Mock Data Studio: schema-driven generation (field → `@faker-js/faker` category mapping, e.g. `{"name": "person.fullName", "email": "internet.email"}`) with JSON / CSV / SQL / XML / YAML / NDJSON export — shipped as a new, separate tool; Random Data Generator's existing quick-pick field UI was left untouched (Milestone 223)
8. Git Command Builder (Milestone 224)
9. Git Command Explainer (break an arbitrary command like `git rebase --onto develop feature-old feature-new` into what each argument means) (Milestone 225)
10. Gitignore Generator (Milestone 226)
11. Gitignore Tester (Milestone 227)
12. Branch Name Generator (Milestone 228)
13. Conventional Commit Builder (Milestone 229)
14. Commit Message Validator (Milestone 230)
15. Git URL Parser (Milestone 231)
16. Git Remote Inspector (Milestone 232)
17. SQL Formatter / Minifier / Beautifier (Milestone 233)
18. SQL Syntax Checker (Milestone 234)
19. SQL Parameterizer (Milestone 235)
20. SQL Dialect Converter (PostgreSQL / SQL Server / MySQL / MariaDB / SQLite / Oracle) — Oracle isn't offered here: `node-sql-parser` (this item's AST engine) has no Oracle grammar to parse from, only `sql-formatter` (item 17) can pretty-print PL/SQL (Milestone 236)
21. SQL Query Explainer (static, pattern-based — not a live `EXPLAIN` against a running database) (Milestone 237)
22. CREATE TABLE Generator — infers columns from a pasted JSON/CSV sample with per-dialect type mapping; distinct from the pre-existing Model Generator's SQL emit mode, which converts an arbitrary nested JSON shape to a model across nine languages rather than a tabular sample to dialect-specific DDL (Milestone 238)
23. SQL → CSV, CSV → INSERT statements, JSON → INSERT statements — extended the existing `csv-sql` tool with a third `json-to-sql` direction rather than a new tool (Milestone 239)
24. Schema Diff (comparing two schema definitions as text) (Milestone 241)
25. Dockerfile Linter / Formatter (Milestone 242)
26. Docker Compose Validator / Viewer (Milestone 243)
27. Docker Run ↔ Compose Converter (Milestone 244)
28. Kubernetes Manifest YAML Validator / Formatter (Milestone 245)
29. Kubernetes Manifest Diff (Milestone 246)
30. kubeconfig Inspector (Milestone 247)
31. Kubernetes Quantity Converter (Milestone 248)
32. Kubernetes CronJob Schedule Tester (Milestone 249)
33. Kubernetes Resource Requests Calculator (Milestone 250)
34. Kubernetes Base64 Secret Encoder / Decoder (Milestone 251)
35. `.env` Editor (Milestone 252)
36. `.env` Validator (Milestone 253)
37. `.env` Diff (Milestone 254)
38. `.env` ↔ JSON (Milestone 255)
39. Config File Comparator (Milestone 256)
40. Secret Detector (flag likely credentials/keys in pasted text or config) (Milestone 257)
41. Missing Environment Variable Detector (Milestone 258)
42. Configuration Merge Tool (Milestone 259)
43. IP Address Inspector (pure computation) — introduced the shared `ip-math.ts` (IPv4 32-bit integer math, IPv6 128-bit `bigint` math) that items 44-48 build on (Milestone 260)
44. CIDR Calculator (Milestone 261)
45. Subnet Calculator (Milestone 262)
46. IPv4 ↔ Integer Converter (Milestone 263)
47. IPv6 Explorer (Milestone 264)
48. MAC Address Inspector (Milestone 265)

<a id="notes-15"></a>

### Notes

Items 8-16 are distinct from the existing Git Repo Browser ([Initial Showcase Tool Set](#initial-showcase-tool-set)), which already does commit-history browsing/diffing over a locally-selected `.git` folder via `isomorphic-git` — these are text/URL-level tools with no repository needed. Items 43-48 look like "Networking" but are pure math/string manipulation and therefore remained browser-safe. Live database connections (SQL Server/PostgreSQL/MySQL/Redis/MongoDB explorers) are covered by Phase 33, while live Docker/Kubernetes daemon/cluster access is covered by Phases 34 and 50.

New dependencies added: `ulid`, `nanoid`, `@paralleldrive/cuid2` (item 2-5), `sql-formatter` and `node-sql-parser` (items 17-24). `ksuid` was deliberately **not** added — the published npm package hard-requires Node's `crypto`/`Buffer` globals with no browser build, so item 6 hand-rolls the same base62/epoch scheme instead (base62 encode/decode via the already-installed `base-x`, randomness via Web Crypto). Gitignore Generator (item 10) ships a curated, bundled template set rather than a live GitHub gitignore-API fetch, keeping every one of this phase's 48 tools fully offline — no `docs/SECURITY.md` changes were needed.

<a id="phase-20"></a>

## Phase 20 — File & Binary Format Inspection

**Status:** ✅ Complete

Goal: add file-upload-based binary/executable/format inspection — parsing whatever bytes the user provides, no OS access needed.

**Achieved (Milestones 266-281):** 16 tools shipped, three foundational shared utilities extracted along the way (`shared/utils/byte-entropy.ts`, `binary-strings.ts`, and `struct-reader.ts`, alongside the pre-existing `byte-codec.ts`), consumed in dependency-first order rather than the source list's original numbering:

1. File Signature & Type Detector (Milestone 266) — merges the source list's items 2 (File Signature Inspector) and 3 (File Type Detector) into one tool: raw magic-byte match plus ZIP-container disambiguation (docx/xlsx/pptx/jar/apk/odt/ods/odp) and an extension-mismatch warning, on a much larger shared signature table (`shared/utils/file-signatures.ts`) than File Base64 Converter's original MIME-sniffing ([Phase 7](#phase-7))
2. File Entropy Analyzer (Milestone 267) — introduced `shared/utils/byte-entropy.ts` (true Shannon byte-distribution entropy, distinct from Secret Detector's charset-based estimate, [Accessibility](../product/UX_SPEC.md#accessibility) item 40)
3. Byte Frequency Analyzer (Milestone 268)
4. Binary Strings Extractor (Milestone 269) — introduced `shared/utils/binary-strings.ts`
5. Encoding Detector (Milestone 270)
6. BOM Detector / Remover (Milestone 271)
7. Hex Editor (Milestone 272) — a genuinely interactive click-to-edit byte grid, kept distinct from the pre-existing Hex Dump Viewer/Builder's paste-and-rebuild-from-text workflow ([Phase 11](#phase-11)) rather than duplicating it
8. Hex Diff (Milestone 273) — extends Directory Diff's binary hex-diff mode ([Phase 7](#phase-7)) into a standalone single-file tool; extracted `computeByteDiff`/`looksLikeText` to `shared/utils/byte-diff.ts` on this second consumer
9. Binary Structure Inspector (Milestone 274) — introduced `shared/utils/struct-reader.ts` (endianness-aware DataView primitives), the foundation items 10-12 build their fixed schemas on; a general user-defined field-list parser rather than a hardcoded set of known formats
10. PE (Windows executable) Header Viewer (Milestone 275)
11. ELF Header Viewer (Milestone 276)
12. Mach-O Header Viewer (Milestone 277)
13. DPI Calculator (Milestone 278)
14. Aspect Ratio Calculator (Milestone 279) — extracted Image Metadata Inspector's local ratio-simplification helper to `shared/utils/aspect-ratio.ts` on this second consumer
15. Resolution Calculator (Milestone 280)
16. File Inspector (Milestone 281) — the "File Forensics" summary dashboard, built last since it composes the signature/entropy/strings utilities items 1, 2, and 4 introduced

<a id="notes-16"></a>

### Notes

The source list's item 9 (Endianness Viewer) was dropped outright rather than shipped: it would have duplicated the already-shipped Numeric Representation Inspector ([Phase 11](#phase-11)), which covers byte-order/IEEE-754/integer representation across bit widths. PE/ELF/Mach-O header viewers (items 10-12 above) only need the uploaded binary's header bytes, not a running executable, so they remained browser-safe despite reading like "system" tools; their import/export/dylib table parsing is basic (names and counts, not full symbol/relocation tables). Items 13-15 are pure math and were pulled out of the source doc's "Screen / Pixel Tools" section — the native live-screen variants (screen ruler, live pixel picker) are covered by Phase 35.

<a id="phase-21"></a>

## Phase 21 — Cross-Tool Workflow Foundations

**Status:** ✅ Complete — Universal I/O Contract shipped as Milestone 31, Transformation Pipelines + user-defined tool scripting shipped as Milestones 283–286, Smart Paste-Detection shipped as Milestone 288, Persistent Workspace/Scratchpad + Saved Sessions shipped as Milestones 289–294, Persistent Local History shipped as Milestones 295–297

Unlike every other phase in this roadmap, this one was never "pick an item, build it in the existing pattern" — its items are cross-cutting architecture ideas that change the tool registry contract itself rather than adding a new tool that consumes it, so most of them stay placeholders until they get their own design pass.

1. **Universal Input/Output Contract** — ✅ shipped as Milestone 31. Pipelines are only "almost automatic" if tools already agree on what they consume and produce: every tool declares its inputs/outputs in a small shared vocabulary — `Text`, `Bytes`, `File`, `JSON`, `Table`, `HTTPResponse` — instead of inventing its own ad hoc shape. `DudeDataType` (`src/app/shared/models/tool-io.model.ts`) is `text | json | bytes | file | table | url | http-response`; `ToolDefinition.io: { accepts, produces }` is populated on every registry entry. This is declarative documentation only, following the same soft-launch precedent as `persistence`/`execution`/`network` — items 2–5 below still each need their own design pass before being scheduled; only the shared vocabulary itself is done.
   - **Milestone 282 audit:** with all 277 tools declaring `io`, a read-only audit checked accuracy (does the declared `io` match what each tool's component actually does) rather than just presence. It found real drift across ~33 tools — mostly `produces` omitting `file` despite a working download/export button, plus several tool-cluster inconsistencies with no documented rule (generator `accepts` conventions, decoder-family `produces`, CSV/JSON-family type pairing). Milestone 282 corrected those, made `io` a required field on `ToolDefinition` (was `io?:`) so a future tool can't omit it, and wired the previously-unused `http-response` type into `curl-converter`/`http-request-builder`'s `accepts`. Two things were deliberately left for a future pass rather than decided unilaterally here: (1) a larger, unresolved split between a "text-report" and a "json-structured-findings" convention across ~20 config/git-linter vs. binary-forensics tools, and (2) vocabulary gaps the current 7-type set can't cleanly express — no arity concept for two-input tools (diff/merge/join), no distinct type for a directory/multi-file bundle (`directory-diff`, `archive-tool`) or a live camera stream (`qr-code-scanner`'s webcam mode) vs. a single `file`.
2. **Transformation Pipelines** — ✅ shipped as Milestones 283–286. Chains existing tools into a single reusable workflow (e.g. `Base64 Decode → JSON Formatter → …`) instead of visiting separate tools and manually copying output to input each time, via a new `PipelineStep` contract (`src/app/shared/models/pipeline-step.model.ts`) that 225 of 277 tools were mechanically retrofitted with — a thin `<id>.pipeline-step.ts` adapter per tool, resolved purely by naming convention (`core/pipeline/pipeline-step-loader.ts`'s convention-derived dynamic import), never a hand-maintained field on `ToolDefinition` or a parallel id-keyed map. The remaining 52 tools are deliberately excluded and individually documented (`core/pipeline/pipeline-coverage.spec.ts`): genuine multi-input tools (diff/merge/join-shaped, or a document+schema pair — the vocabulary gap Milestone 282 already flagged), network-required tools, crypto tools needing a caller-supplied key with no honest zero-config mode, interactive/stateful UIs with no real transform, and tools with no pure-logic file to adapt without a rewrite. Chaining is sequential-only (no branching/fan-out) with no automatic type coercion between steps — a mismatch must be bridged by inserting another compatible tool (or a script, below), never silently converted. This was, as anticipated, the one roadmap item allowed to touch `shell/`/`core/`: a new `/pipelines` route tree and sidebar entry (`src/app/shell/pipelines/`), kept registry-adjacent rather than a 278th tool (no category, no `TOOL_DEFINITIONS` entry).
   - **User-defined tool scripting** — ✅ shipped alongside Transformation Pipelines as Milestone 286, as a dependent extension of it: a user writes and locally saves their own custom transformation step (`/pipelines/scripts`), reusing the sandbox already shipped in Phase 6 (an opaque-origin iframe plus a nested, force-terminable Worker) unmodified rather than needing new execution infrastructure. At the time this shipped, it was explicitly distinguished from the then-banned “plugin installation from remote sources” ([Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries)): a user's own script never leaves their machine or gets distributed to anyone else. That distinction remains important even though Phases 56–57 later revisit extensions under a separate signed, capability-declared, sandboxed model. A script is a first-class step type validated exactly like a built-in tool step (it declares its own `accepts`/`produces`), and a hung/errored/malformed-output script halts the pipeline the same way a failed built-in step would.
3. **Smart Paste-Detection** — ✅ shipped as Milestone 288. A dedicated `/smart-paste` page (`src/app/shell/smart-paste/`) that inspects pasted content and suggests the tool that understands it. This matters for discoverability the way the command palette ([Command palette](../product/UX_SPEC.md#command-palette)/[Command Palette Requirements](../product/UX_SPEC.md#command-palette-requirements)) already helps when a user knows what they want but not where it lives — this helps when they don't yet know what they want to do with what they're holding. A curated, hand-maintained `PASTE_DETECTORS` registry (`src/app/core/paste-detect/`, 11 shapes for v1: JSON, JWT, UUID, ULID, KSUID, Snowflake id, hex color, IPv4/IPv6, URL, Base64, Unix timestamp) ranks candidate matches by confidence, reusing each tool's existing pure-logic export rather than reimplementing shape recognition. Deliberately **not** the same per-tool `<id>.pipeline-step.ts` convention Item 2 uses — detection has to run every detector against the same input on every keystroke, which the per-paste dynamic-import cost of that convention doesn't suit at this curated scale (see `src/app/core/paste-detect/AGENTS.md`). Picking a suggestion navigates to the matching tool and prefills its input via a one-shot, in-memory-only hand-off (`PasteHandoffService`) — never persisted, consistent with [Default policy](../architecture/DATA_SYNC_ARCHITECTURE.md#default-policy)'s sensitive-payload default. Ambient/global paste capture (detecting a paste anywhere in the app, not just on this dedicated page) was considered and deliberately deferred to a future pass; NanoID was excluded from the v1 shape set for having no fixed structural signature to detect against. **Extended (Milestone 473):** 12 document-format detectors (SVG, HTML, XML, Markdown, YAML, Kubernetes manifests, SQL, CSV, CSS, Dockerfile, `.env`, stack traces) joined the 11 ID/token shapes. They use lightweight, bounded structural sniffers (`core/paste-detect/text-format-sniffers.ts`) rather than the owning tools' parsers — `PASTE_DETECTORS` ships in the prefetched shell via the ambient chip, and those parsers are heavy lazy dependencies — and are scored so any ID/token match outranks them. Their targets receive the paste through the Universal File Input text hand-off (Phase 24 Item 4's follow-up), which writes it into the tool's own declared input key: the value lands only where that tool's own persistence policy would have put it had the user typed it; `PasteHandoffService` itself remains in-memory-only.
4. **Persistent Workspace / Scratchpad** — ✅ shipped as Milestones 289–294. A multi-tool workbench (not a source-code IDE, per the ceiling below): a tab strip and a recursive panel tree let more than one tool be open — and, via "split right," visible side by side — at once, mounted through a new `ToolHost` (`src/app/shell/workspace/tool-host/`) that dynamically loads a tool's existing lazy `ToolDefinition.load()` via `NgComponentOutlet`, rather than named router outlets (rejected — panel count is open-ended, which would mean either a multiplicative blow-up of the route table per outlet slot or an ever-growing URL segment nothing else in DUDE does). Panels reuse the existing `SplitPane` primitive ([Shared Tool Shell](../product/UX_SPEC.md#shared-tool-shell)) unmodified. A collapsible scratchpad drawer holds manually-saved snippets/notes, independent of the automatic per-tool mirroring. The shared `<id>.workspace-step.ts` adapter convention (`src/app/shared/models/workspace-step.model.ts`, resolved by the same naming-convention dynamic import as Item 2's `<id>.pipeline-step.ts`) is what both this item and Item 5 build on. **The governing rule, resolving the hardest design tension:** no part of this feature may ever cause a tool's content to outlive the `PersistencePolicy` that tool's own code already declares ([Default policy](../architecture/DATA_SYNC_ARCHITECTURE.md#default-policy)) — tab/panel *layout* is treated as the "layout preference" [Default policy](../architecture/DATA_SYNC_ARCHITECTURE.md#default-policy) already names as safe to persist and restores unconditionally via a `local`-policy pseudo-tool store (`'__workspace__'`, the same synthetic-toolId trick `PipelineStoreService` uses for `'__pipelines__'`), but tool *content* is never separately copied or promoted — restoring a tab just remounts that tool's component, which re-reads its own already-existing `persistence.signal` values exactly as on any ordinary navigation. This is also why the originally-anticipated IndexedDB "durable content tier" for Saved Sessions turned out to be unnecessary (a real relaunch wipes all in-memory JS state anyway, leaving only `localStorage`/`sessionStorage`, which the tool's own code already reads correctly) — see `core/workspace/AGENTS.md`.
   - **Saved Sessions** — restoring open tools/inputs on relaunch — shipped as part of this (Milestone 293), exactly as the governing rule above describes: layout always restores; content restores only insofar as each tool's own policy already allowed it.
5. **Persistent Local History** — ✅ shipped as Milestones 295–297. A cross-tool history (`/history`, `src/app/shell/history/`) backed by a new IndexedDB store (`src/app/core/history/history-db.ts`, on top of a shared `src/app/core/storage/indexed-db.ts` primitive — this codebase's first IndexedDB usage) with per-tool/global/age/size retention caps that degrade gracefully ([Large Inputs](../product/PRODUCT_SPEC.md#large-inputs)) rather than throwing. Reuses Item 4's `<id>.workspace-step.ts` adapter rather than a second convention: a tool opts in via an explicit `historyEligible: true`, defaulting to excluded — deliberately **not** inferred from the tool's own `PersistencePolicy`, since that field answers a narrower question ("does this survive a refresh, inside this one tool") than History's actual one ("should this sit in a global, searchable, cross-tool feed indefinitely"); see `core/history/AGENTS.md` for the exclusion categories (sensitive-by-design, pure reference/lookup, sandboxed-execution-source-only). The mechanical retrofit (Milestones 296–297) touched 215 of 277 tools; the remaining 62 are individually documented in `core/workspace/workspace-coverage.spec.ts` (mirroring `pipeline-coverage.spec.ts`'s shape) — mostly binary/file-upload-only tools with nothing serializable, pure-reference tables, or tools whose relevant field is already sensitive-by-design in the tool's own code. `ToolShell.ngOnDestroy` is the single capture trigger, firing identically whether a tool was left via its own route or swapped out of a Workspace panel; clicking a History entry reuses the exact same `workspaceStep.restore()` `ToolHost` uses for tab reopen.

<a id="notes-17"></a>

### Notes

This phase intentionally breaks from [Expansion is roadmap-driven](../DUDE_PRD.md#expansion-is-roadmap-driven)'s "any single unit of work should be scoped and finished on its own terms" — these items are listed together because they're interdependent, not because they're meant to ship as one unit.

**Amendment (2026-09-21):** [Interview Questions and Answers](DECISION_LOG.md#interview-questions-and-answers)'s Q11 (Navigation) originally read “no IDE-style persistent tabs.” That boundary narrowed, rather than reversed, when item 4 became a real roadmap item: the Phase 21 standing ceiling was “a multi-tool workbench, not a source-code IDE,” and a Monaco-style full IDE was explicitly out of scope at that point. Later Phases 77–80 deliberately revisit editor/LSP/terminal/project surfaces, but the durable [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries) identity boundary still prevents DUDE from becoming a conventional VS Code clone; see the Workbench Identity Gate before Phase 77.

**Amendment (2026-09-25):** Items 4–5 complete their design pass and ship. The one rule that resolved the hardest tension between them and [Default policy](../architecture/DATA_SYNC_ARCHITECTURE.md#default-policy)/[Sensitive Inputs](../architecture/SECURITY_ARCHITECTURE.md#sensitive-inputs): **neither feature may ever cause a tool's content to outlive the `PersistencePolicy` that tool's own code already declares.** Tab/panel *layout* is treated as the "layout preference" [Default policy](../architecture/DATA_SYNC_ARCHITECTURE.md#default-policy) already names as safe to persist, and restores unconditionally via a `local`-policy pseudo-tool store (`'__workspace__'`, the same synthetic-toolId pattern `PipelineStoreService` uses for `'__pipelines__'`). Tool *content* is never separately copied or promoted — restoring a tab remounts that tool's component, which re-reads its own already-existing `persistence.signal` values exactly as on any ordinary navigation, so a `'none'`/`'session'`-policy tool's content reappearing across a full relaunch remains exactly as impossible as it is today. The shared `<id>.workspace-step.ts` adapter (used by both Workspace mirroring and History, via the same convention-based-loader pattern `<id>.pipeline-step.ts` established in Milestone 283) deliberately carries no independent "relaunch-safe" flag, to avoid a second, driftable sensitivity judgment alongside the tool's real one. History's IndexedDB store, being `local`-equivalent in durability, inherits the identical rule, and defaults every tool to History-*ineligible* until it explicitly opts in via `historyEligible: true`. Item 4's core (Milestones 289–294: contract, proof-of-concept, tabs/panels, scratchpad, Saved Sessions, and wiring the long-dormant `PersistenceOptIn` component into `python-playground`) shipped as a complete, standalone unit before Item 5's mechanical retrofit (Milestones 295–297) began — Saved Sessions' actual relaunch value never depended on the retrofit at all, since layout restore only needs route ids every tool already has via the registry.

---

**Browser/native capability boundary.** A large and genuinely useful category of developer tools — live networking, live DNS/TLS, arbitrary filesystem operations, Windows-native system tools, local listening servers, and live database connections — is simply unreachable from a sandboxed browser tab. Phase 8 provides the shipped desktop foundation for those capabilities. Phase 27 shipped the first of these (network diagnostics); Phases 28–34 are the authoritative native-capability roadmap for the rest, with per-capability web/desktop availability and shared-core reuse instead of a separate product hierarchy.

<a id="phase-22"></a>

## Phase 22 — Platform Hardening, Trust & Desktop-First Pivot

**Status:** ✅ Complete — shipped as Milestones 300–307: distributed tool manifests + registry codegen, ToolShell single-source-of-truth migration, registry structural validation + conformance harness, generated tool catalog documentation, shared-logic boundary audit, dependency boundary validation via ESLint, chunk/offline-cache budgeting, architecture documentation refresh

This is deliberately another framework-first phase. DUDE has already proven that it can add tools quickly; the next architectural risk is no longer insufficient breadth, but accumulated registry complexity, metadata drift, correctness confidence, bundle/cache growth, and the increasing consequences of native desktop capabilities.

The goal is to make the platform capable of safely supporting the next several hundred tools and workflows before continuing aggressive feature expansion.

1. Distributed Tool Manifests — break the monolithic "TOOL_DEFINITIONS" registry into tool-local or category-local manifests composed at build time. A new tool should own its metadata beside its implementation rather than requiring edits to a multi-thousand-line central file.

2. Single Source of Truth for Tool Metadata — "ToolShell", routing, network indicators, persistence indicators, status badges, titles, categories, I/O capabilities, and future confidence indicators all resolve directly from the registered tool definition rather than duplicating metadata at component call sites.

3. Registry Structural Validation — CI validates unique IDs/routes, valid categories, valid I/O declarations, persistence compatibility, pipeline adapters, lazy-loader existence, status fields, desktop/web availability, and documentation metadata.

4. Generated Tool Catalog Documentation — README tool lists, tool counts, category indexes, supported-platform tables, network/privacy disclosures, and similar mechanical documentation are generated from registry metadata rather than manually maintained.

5. Shared-Logic Boundary Audit — transformation logic that can be platform-neutral is moved behind reusable modules so Angular, Electron, CLI, VS Code, browser extensions, tests, and future SDKs do not reimplement it.

6. ToolShell Metadata Context — every mounted tool receives its canonical "ToolDefinition" through shared route/tool context, eliminating repeated title/status/network/persistence declarations.

7. Chunk Budgeting — establish warning/error budgets for individual lazy tool chunks, major shared chunks, startup code, desktop preload code, and large WASM/runtime payloads.

8. Offline Cache Budgeting — measure and constrain total Cache Storage footprint instead of only the initial JS bundle.

9. Service-Worker Cache Strategy Audit — stop broadly prefetching lazy JavaScript merely because it matches a generic "*.js" asset pattern; shell-critical resources remain prefetched while large tool families, optional runtimes, and infrequently-used chunks become lazy/on-demand cached.

10. Dependency Boundary Validation — prevent browser-only code, Electron-only code, Node built-ins, large runtime dependencies, or security-sensitive APIs from accidentally crossing platform boundaries.

11. Tool Conformance Harness — every registered tool can be mechanically checked for route loading, shell mounting, metadata completeness, reset behavior, and basic failure isolation.

12. Architecture Documentation Refresh — update "ADDING_A_TOOL.md", "AGENTS.md", security documentation, platform documentation, and the PRD so they describe the actual post-Phase-21/post-desktop architecture rather than accumulating historical amendments.

Goal: make tool #500 no more structurally dangerous to add than tool #50, while retiring the architectural debt created by the platform's rapid expansion.

<a id="phase-23"></a>

## Phase 23 — Correctness, Verification & High-Consequence Tool Hardening

**Status:** Complete: 277/277 manifests verified, 0 blocked; Phase 23 evidence and exceptions in `.phase23/FINAL_REPORT.md`, tool ledger in `.phase23/ledger.json`; Milestones 308-406

DUDE now handles cryptography, authentication material, certificates, binary formats, SQL, config files, archives, executable formats, arbitrary code, filesystem operations, and eventually live system state. Those tools need a stronger definition of “stable” than “the UI appears to work.”

1. Tool Confidence Model — expand the current "stable" / "experimental" distinction into an explicit confidence model such as "experimental", "stable", and "verified", without implying formal certification. **✅ Shipped (Milestone 308)**: `ToolDefinition.status` now includes `'verified'`, with a `verification` metadata block (`vectors`/`crossChecked`/`propertyTested`/`summary`) and a conformance check requiring `summary` on any `verified` tool.

2. Published Test Vectors — cryptography, encodings, JWT/JWS/JWK, UUID variants, certificates, checksums, protocol codecs, compression formats, and standardized binary formats should use official or widely accepted test vectors where available. **✅ Rolled out (Milestones 320-406)**: 31 verified manifests record published vectors, covering representative crypto/authentication, encoding, URL/JSON, HTTP, CSV, IP, CBOR, and Protobuf standards. Exact-vector claims are omitted where published examples do not match a tool's exposed API; see `.phase23/FINAL_REPORT.md` and the tool ledger for limits.

3. Reference-Implementation Cross-Checking — selected converters/parsers are tested against independent mature implementations so DUDE is not merely proving that its encoder and decoder agree with each other. **✅ Rolled out (Milestones 320-406)**: 20 verified manifests record independent cross-checks, including SSH/PKI and executable formats against `ssh-keygen`, OpenSSL, and Python libraries; crypto, compression, and archives are also checked against independent implementations. The tool ledger records each tool's evidence and limits.

4. Property-Based Testing — round-trip-capable transformations receive generated tests such as decode(encode(x)) = x and parse(serialize(x)) preserving the documented semantics. **✅ Rolled out (Milestones 312-406)**: `fast-check` is documented in `ADDING_A_TOOL.md`; 255 verified manifests record generated property or fuzz testing suited to each tool's behavior. The ledger records the recipe and any excluded input domains.

5. Parser Fuzzing — structured-data, archive, binary, certificate, URL, expression, and config parsers receive fuzz/property testing for malformed and adversarial input. **✅ Rolled out (Milestones 313-406)**: the initial JSON/YAML/XML never-throws and typed-Result tests expanded through the tool verification rollout. Parser recipes and tool-specific limits are recorded in `.phase23/ledger.json`.

6. Golden Corpus Tests — maintain representative real-world samples for PE, ELF, Mach-O, certificates, JSON/YAML/XML, SQL, logs, Git data, archives, images, and other complex formats. **✅ Rolled out (Milestones 314-406)**: the `__fixtures__/` convention now covers PE/ELF/Mach-O, a real X.509 certificate, JSON/YAML/XML, SQLite, ZIP/TAR, and PNG. Fixture provenance and independent checks are documented alongside the samples; add further corpora as new format-specific risks arise.

7. High-Consequence Tool Matrix — explicitly identify crypto, authentication, code-execution, filesystem-write, process-management, registry, network-scanning, database-write, and secret-management tools as requiring stronger review. **✅ Shipped (Milestone 309)**: `ConsequenceClass` on `ToolDefinition`; every shipped crypto/authentication/code-execution/secret-management tool tagged. The native-capability classes were initially reserved for the tools that would use them. Phase 27 (Milestone 489) put `network-scanning` into use (Port Scanner, guided Diagnostic Bundle). It also added a tenth class, `remote-write`, for HTTP methods that can change server state (TCP/HTTP Connectivity Tester). `filesystem-write` is now used by Phase 29's previewed, journaled local file changes. Phase 31 put `process-management` (also used earlier by Phase 28's gated packet capture) and `registry` into wide use for Process Viewer, Port → Process Lookup, Environment Variables, PATH Editor, Registry Editor and related tools. It added an eleventh class, `system-config`, for services, scheduled tasks, startup entries, Windows features, software uninstall and ACL changes. Only `database-write` remains reserved.

8. Destructive-Action Harness — verify that every destructive desktop action has an explicit confirmation boundary and cannot be triggered merely by opening/importing data. **✅ Contract documented (Milestone 311)**: [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract) spells out the two-step-confirm/no-incidental-trigger/tagging/test requirements. Phase 29's filesystem mutation engine and Phase 31's system mutation engine now enforce plan preview, a short-lived single-use token, precondition checks, journaling and previewed undo; mutating tools have colocated confirmation-boundary tests.

9. Sandbox Regression Suite — continuously verify the Phase 6 arbitrary-code isolation assumptions and Electron "contextIsolation"/preload boundaries. **✅ Shipped (Milestones 315-406)**: real-browser Playwright tests cover opaque-origin isolation, CSP denial of unallowlisted scripts, `Worker.terminate()`'s hard stop, and Python iframe recreation; `npm run test:electron` covers the preload/path boundary and `main.ts`'s `webPreferences`.

10. Performance Regression Corpus — retain large-input fixtures and performance baselines for expensive parsers, diffs, hashing, directory operations, archive tools, and binary viewers. **✅ Shipped (Milestones 316-406)**: opt-in `perf/` (`npm run test:perf`) covers hashing, text diff, JSON, binary structures, archives, and directory comparison against procedurally generated large inputs with headroomed budgets.

11. Deterministic Test Fixtures — remove unnecessary time/network/randomness from correctness tests so failures remain reproducible. **✅ Audited (Milestone 317)**: repo-wide scan for unseeded `Math.random()`/`Date.now()`/`new Date()`; fixed the two real cases found (password-generator's separator ambiguity, qr-decode's random noise).

12. Capability-Specific Release Gates — a failure in security-critical infrastructure blocks release even if unrelated utility tests still pass. **✅ Shipped (Milestone 318)**: `scripts/check-high-consequence-gate.mjs` (`npm run test:high-consequence`) re-runs every high-consequence tool's specs as its own required, separately-labeled CI step.

13. Security Documentation Generation — derive tool network capability, persistence policy, native privileges, and external-service usage from metadata where possible. **✅ Shipped (Milestone 310)**: `scripts/generate-security-doc.mjs` generates `SECURITY.md`'s High-Consequence Tool Matrix and network/native-capability disclosure tables from manifest metadata.

14. Verified Tool Badge — optionally expose the highest-confidence status to users, with a compact explanation of what was tested rather than making vague security claims. **✅ Shipped (Milestone 319)**: `ToolShell`'s status badge shows `verification.summary` as a tooltip for any `verified` tool.

**Tool rollout status (Milestones 320-406):** all 277 tool manifests are `verified`, including the 228 tracked in `.phase23/ledger.json`; zero ledger entries are blocked. The other 49 tools were verified before that ledger was created. `verified` records internal test evidence suited to each tool, not formal certification or a claim that every tool has every test type. New tools follow `ADDING_A_TOOL.md`'s "Status & confidence tiers" checklist.

Goal: transform “vibe coded” from a correctness caveat into merely the way the first implementation happened to be produced.

<a id="phase-24"></a>

## Phase 24 — Smart Entry, Discovery & Personal DUDE

**Status:** ✅ Complete — shipped as Milestones 407–420

Phase 21 shipped Smart Paste, pipelines, workspaces, Saved Sessions, and local history. This phase turns those capabilities into the primary user experience rather than advanced features hidden behind navigation.

1. Paste-First Home Surface — the fastest path into DUDE becomes “paste/drop something,” with tool/category navigation remaining available for users who already know what they want. **✅ Shipped (Milestones 409, 415)**: Deck grows a "Give it to DUDE" hero (paste box + drop zone) above Recently Used/Favorites/Pinned-Pipelines rails, with the existing search+category grid demoted to a "Browse all tools" section below — fully preserved, not replaced.

2. Ambient Smart Paste — optionally detect pasted content from appropriate shared input surfaces rather than requiring navigation to "/smart-paste". **✅ Shipped (Milestone 413)**: a global `paste` listener (`AmbientPasteChip`) reuses `PASTE_DETECTORS`/`detectShapes` unmodified via a stricter confidence floor, never firing on a paste already landing in an editable field.

3. Desktop Global Smart Paste Hotkey — a system-wide shortcut opens DUDE with clipboard contents already classified, without permanently storing them. **✅ Shipped (Milestone 416, desktop-only)**: `electron/smart-paste-hotkey.ts`, a sibling to `hotkey-bridge.ts`'s clipboard `QUICK_ACTIONS` (not an edit to it, since its effect — focusing the window with classified clipboard content — is materially different). Classification stays 100% renderer-side.

4. Smart File Drop — dropping a file identifies likely applicable tools from extension, MIME type, signature bytes, and registered I/O capabilities. **✅ Shipped (Milestones 414–415), on both desktop and web**: extension/MIME/signature-byte sniffing all work client-side on a dropped `File`, so this deliberately shipped on the web/PWA build too, not desktop-only as originally floated — see `core/file-drop-detect/AGENTS.md`. **Follow-up — Universal File Input (Milestones 469–472):** as shipped, the hand-off was opt-in per tool and only File Hash/File Base64 consumed it, so every other suggested tool opened empty. The shared `app-file-drop` now consumes the hand-off generically for whatever tool it's mounted in (no per-tool wiring; mode-gated inputs `has()`-check and switch modes). Text/code tools declare `fileInput: { key, extensions }` in their manifest (or reuse `desktopOpen.inputKey`): Smart File Drop ranks them for those extensions and writes the file's text into that key before navigating — the same mechanism as Explorer "Open with DUDE". 57 text/code tools gained a shared Open file… button, drop-a-file-onto-the-input, and a Save… button for their output (`showSaveFilePicker`, download fallback — the user chooses the destination, so this is not a `filesystem-write` capability). Scope ceiling: this is loading and saving *text inputs/outputs*; it is not a file manager or a watched-file editing model (Markdown Workspace has no file-watch consumer; Phase 29's opt-in watching belongs to Directory Diff, Git Repo Browser and Large-File Inspector). The same pass fixed live-document `innerHTML` parsing in four HTML tools that let injected event handlers run (Milestone 471) — see `core/text-file-input/AGENTS.md`.

5. Local Usage Frequency — maintain private local usage counts to improve local ranking. **✅ Shipped (Milestone 407)**: `UsageService`, uniform across all 277 tools (unlike History, no per-tool opt-in — see `core/usage/AGENTS.md`), recording only `{toolId, count, lastUsedAt}`.

6. Recently Used Tools — first-class shell surface. **✅ Shipped (Milestones 407, 409)**: a Deck rail sourced from `UsageService`.

7. Favorites / Pinned Tools — first-class shell surface rather than an optional MVP enhancement. **✅ Shipped (Milestones 408–409)**: a star toggle in `ToolShell`'s header plus a Deck rail; a Home rail was judged sufficient for v1, no separate full-page route.

8. Pinned Pipelines — frequently-used workflows appear beside tools. **✅ Shipped (Milestones 408, 410)**: a pin toggle per pipeline row, a "Pinned" section atop the Pipelines list, and a matching Deck rail.

9. Related-Tool Suggestions — output types and registry metadata drive contextual “next useful action” recommendations. **✅ Shipped (Milestone 411)**: ranks by `io.accepts`/`io.produces` overlap via the same `canChain` Pipelines already uses, boosted when both tools are pipeline-eligible. Caught and fixed during verification: the panel must never eagerly load the pipeline-step registry, since it mounts on every tool page — see `core/suggestions/AGENTS.md`.

10. Pipeline Suggestions — after common sequential tool use, DUDE may locally suggest turning the repeated sequence into a saved pipeline. **✅ Shipped (Milestone 412)**: a pure scan of `UsageService`'s recent-open log for repeated, pipeline-eligible sequences within a rolling gap window, surfaced only on the Pipelines list (deliberately not on Home/Deck, for the same eager-load reason as Item 9).

11. Workspace Templates — named arrangements such as “API Debugging,” “JWT/Auth,” “Data Cleanup,” “Certificate Inspection,” and user-defined templates. **✅ Shipped (Milestone 417)**: 4 curated built-in templates plus user-defined ones, all applied through one `WorkspaceLayoutService.applyLayout()` setter.

12. Quick Actions — common transformations can run without navigating into the full tool workspace. **✅ Shipped (Milestone 418) as "Quick Run"** — renamed to avoid colliding with the already-shipped Electron feature of that name (`electron/hotkey-bridge.ts`, Phase 8 Stage 5's global-hotkey clipboard transforms, left unchanged). The `/quick-run` route executes via the exact same `PipelineStep.run(input)` contract Pipelines already uses, scoped to text-accepting steps only.

13. Unified Recents — tools, pipelines, workspaces, local files where permissible, and sessions share one local recent-activity surface. **✅ Shipped (Milestone 419)**: a derived, read-only view (`UnifiedRecentsService`) merging `UsageService`, `PipelineStoreService`, `WorkspaceLayoutService`, and `HistoryService` — never a fifth recording mechanism — surfaced as a "Recents" tab inside `/history`.

14. Private-by-Construction Usage Signals — none of the above requires analytics or server telemetry. **✅ Verified (Milestone 420)**: a mechanical, key-allow-list audit spec over every new store's real persisted JSON (`core/usage/phase24-privacy-audit.spec.ts`), not just a documented claim — mirroring `tool-conformance.spec.ts`'s "checked, not just documented" precedent.

Goal: the user should increasingly think “give this to DUDE” rather than “which one of DUDE's hundreds of tools should I manually find?”

<a id="phase-25"></a>

## Phase 25 — Desktop-First Shell & Native Product Experience

**Status:** ✅ Complete — shipped as Milestones 421–455

Finish the product-positioning change technically: desktop DUDE becomes the primary experience rather than merely the web app inside Electron plus extra capabilities.

1. Desktop-Native Home — prioritize recent workspaces, dropped files, clipboard actions, native capabilities, pipelines, and projects rather than presenting only the web deck. **✅ Shipped (Milestones 421–422, 439–440)**: a minimal, deliberately non-IDE `Project` primitive (`core/project/` — a named panel-tree/tabs snapshot plus pinned pipeline ids, recent tools always derived live from `UnifiedRecentsService`, never a copy) and a `/projects` gallery; Deck grows a desktop-only block — a Recent Workspaces rail (the most-recently-*applied* Workspace Templates, a small applied-recency log added to `WorkspaceTemplateService` itself), a Recent Projects rail, a native "Open File…" button wired to the existing OS picker, and Clipboard Actions / Native Capabilities rails — both filtered views over the Command Palette's live `'native'`-kind commands (item 4), never a second hand-rolled action list.

2. "dude://" Deep Links — tools, pipelines, workspace templates, and safe actions can be addressed through application deep links. **✅ Shipped (Milestones 427–429)**: `dude://open/{tool|workspace-template|project|pipeline}/<id>` (pure navigation) and `dude://run/{pipeline|quick-run}/<id>` (navigates with a pending-confirmation flag; a link can never execute on its own — the same in-app Run click `PipelineConfirmationService` already requires is still mandatory). Registered via a custom NSIS macro at install time and `app.setAsDefaultProtocolClient` for dev; the main process forwards only the raw, length-capped, scheme-checked URL string, with all parsing and routing renderer-side (`core/deep-link/`).

3. Native Menu System — File/Edit/View/Tools/Window/Help commands map cleanly onto DUDE concepts. **✅ Shipped (Milestones 430–431)**: File (Open File/Folder, Preferences, Exit), Edit (pure `role:` passthrough), View (reload/zoom/devtools/fullscreen plus a "Command Palette" item), a registry-driven Tools submenu grouped by category — pushed from the renderer over IPC as a validated `{id,title,route,category}` snapshot, never a static list the main process hard-codes — Window, and Help (Check for Updates, Documentation, About).

4. Command Palette Expansion — tools, pipelines, workspace/session commands, native operations, preferences, recent files, and extension commands share one launcher. **✅ Shipped (Milestones 423–424, 441–443)**: a declared `CommandSource`/`COMMAND_SOURCE` multi-provider contract (`shared/models/command-source.model.ts`) rather than hard-coded shell branches, exactly as this document already anticipated — six sources feed one ranked, `CommandKind`-grouped result list: Tool (unchanged), Workspace (apply/save-as-template), Project (open), Pipeline (navigate-only for now, pending the confirmation gate for direct execution), Native (Check for Updates/Open File/Manage Secrets plus one command per registered clipboard Quick Action), Recents (top-N Unified Recents, reopening each by its own kind), and Preferences (a couple of instant, no-form toggles; "Open Settings" originally lived here). **Follow-up (Milestone 478):** a "Go to" (`navigation`) kind now reaches every shell destination (Home, Smart Paste, Workspace, History, Pipelines, Quick Run, Projects, Settings) plus each core and tool-contributed Settings section; none of these were reachable from Ctrl+K before, and "Open Settings" moved into it. Extension commands remain explicitly out of scope — no plugin loader exists yet — but the `COMMAND_SOURCE` token is that later declared API.

5. Native File Recent List — only for files explicitly opened with desktop DUDE and subject to clear privacy controls. **✅ Shipped (Milestones 444–447)**: only files opened via the existing `--open-with-dude`/Explorer-association flow are ever recorded, as `{path, name, extension, openedAt}` only, never content; merged into Unified Recents as a legitimate fifth input, not a second recording mechanism; Settings offers an opt-out toggle (gates future recordings only, never retroactively purges), a per-entry remove, and a clear-all; reopening a recent re-resolves the file from disk through a new `dude:open:reopen` IPC handler that reuses the existing bounded size/extension checks rather than replaying a cached snapshot; a mechanical privacy-audit spec (mirroring Phase 24 item 14's pattern) asserts the persisted store never gains a content-bearing field.

6. Crash/Restart Workspace Recovery — restore safe workspace layout without extending any individual tool beyond its declared persistence policy. **✅ Shipped (Milestones 448–449)**: workspace restoration itself needed no new code — the existing `'__workspace__'` store already survives a crash identically to a clean quit. What shipped: a small `crash-state.json` marker under Electron's `userData` directory that detects an unclean exit, exposed to the renderer as a static, preload-computed `wasRestoredAfterCrash` flag (passed via `additionalArguments`, not IPC, so it's known synchronously); a dismissible notice appears only on the one launch immediately following an unclean exit, and only when there's an open workspace to report.

7. Desktop Quick Launcher — a minimal global launcher can execute common safe operations without opening the entire main window first. **✅ Shipped (Milestones 432–433)**: reuses the single main `BrowserWindow` rather than a second one, resizing/repositioning it only when it was already hidden to the tray (restoring the prior bounds on dismiss); when the window is already visible/focused, the same global hotkey (default `Ctrl+Shift+Space`, rebindable in Settings) instead surfaces an in-window Command Palette overlay without touching window geometry at all.

8. Native Drag-and-Drop Routing — dropped files/directories are offered directly to compatible tools according to registry I/O capabilities. **✅ Shipped (Milestones 434–436)**: a global window-level drop handler (`shared/components/global-drop-router/`) reuses Phase 24's `detectFileDrop`/`rankFileDropCandidates` matcher unchanged (a dropped file gets the identical ranked, `io.accepts`-aware matching a Smart File Drop already did) — a confident single match auto-navigates, a tie surfaces a disambiguation picker; a dropped directory resolves to a real path via Electron's own `webUtils.getPathForFile()` and routes through a new, narrowly-scoped `dude:open:enqueuePath` handler. Chromium's default drag-drop file-navigation, previously live and unguarded, was hardened (`will-navigate`) as part of the same work. Since Milestone 470 both drop surfaces deliver through one `FileDropDeliveryService` (text to text tools, the `File` to file tools), and inputs carrying `appTextFileDrop` handle their own drops, like `app-file-drop` already did.

9. File Association Framework — tools can declare file types they can inspect while Windows remains in control of final default-app selection. **✅ Shipped (Milestones 437–438)**: the mechanism itself (manifest field, NSIS registry writes, `open-bridge.ts` parsing, matching) already shipped in an earlier phase; this item replaced hand-maintaining the NSIS extension list in four places with a generator (`scripts/generate-file-associations.mjs`, wired into `generate:registry`) and added in-app visibility — an install-time `file-associations.json` marker, read back over IPC and shown in Settings with a "Change in Windows Settings" link. Copy deliberately says "candidate," never "your default app," since the marker reflects the install-time choice, not live OS state.

10. Desktop Capability Indicators — tools visibly communicate when desktop mode unlocks additional capabilities over the web companion. **✅ Shipped (Milestones 450–451; superseded by Milestones 482 and 486)**: the initial free-string `desktopCapabilities` field and `DesktopCapabilityBadge` established the header indicator. Phase 26 replaced them with the closed `capabilities` vocabulary and `PlatformCapabilityBadge`, preserving the quiet desktop confirmation and adding explicit web fallback/unavailable states across discovery surfaces.

11. Desktop-First Documentation — download/install/use-native-capability documentation becomes primary; GitHub Pages remains prominently linked as the zero-install option. **✅ Shipped (Milestones 452–453)**: README's Desktop section moved earlier (right after Screenshots, ahead of the Tools list) with its download/install content promoted ahead of the technical stage-by-stage bullets, plus an explicit cross-link to the zero-install web companion; `docs/SECURITY.md` gained hand-written disclosure subsections, styled like its existing "Camera access" section, for every native capability this phase added that the tool-metadata generator can't cover on its own: deep links, native menu, Quick Launcher, drag-and-drop routing, file-association registry writes, the Native File Recent List, and crash/restart recovery.

12. Desktop Performance Pass — optimize cold start, warm start, tray restore, IPC initialization, and local backend startup. **✅ Shipped (Milestones 454–455)**: dev-only, env-gated (`DUDE_PERF_LOG`) startup marks plus `scripts/measure-desktop-startup.mjs` — a manual local benchmark, never wired into CI, consistent with the existing `perf/` corpus's "reported, not gating" posture. Measured baseline cold start on the dev machine (~335ms, dominated by native `BrowserWindow` construction and the initial page load, not application code); parallelized the independent parts of `createWindow()` (bounds resolution alongside the static-server start; the three hotkey registrations alongside window creation instead of blocking it first) and switched the main window to `show:false` plus show-on-`ready-to-show`, eliminating the blank/white first-paint flash. Audited every always-on renderer service this phase added (native-menu, quick-launcher, deep-link, global-drop-router) — none do expensive constructor-time work.

Goal: make installing DUDE produce a qualitatively better developer workflow, not simply a larger permission envelope.

<a id="phase-26"></a>

## Phase 26 — Web Companion & PWA Efficiency

**Status:** ✅ Complete — shipped as Milestones 482–488

The web build remains the portable, zero-install companion to the canonical desktop application. The service worker stays stock Angular; desktop handoff only navigates to a target, while state/file/token handoff remains Phase 59 scope.

1. Minimal Initial Shell Cache — **✅ Verified (Milestone 483)**: Phase 22 (Milestones 300–307) already delivered selective prefetch; M483 closed the EJS gap and added the asset-group coverage check.
2. On-Demand Tool Chunk Caching — **✅ Verified (Milestone 483)**: Phase 22 (Milestones 300–307) delivered lazy tool chunks; M483 added readiness mapping and group-coverage checks.
3. On-Demand WASM Runtime Caching — **✅ Verified (Milestone 483)**: Phase 22 (Milestones 300–307) delivered lazy Pyodide/sql.js/xmllint groups; M483 added EJS and per-runtime inspection.
4. Cache Storage Budget / Inspector — **✅ Shipped (Milestone 483)**: budget checks, offline map, storage estimate/persistence, and group-size reporting.
5. Clear Cached Runtimes / Repair Installation — **✅ Shipped (Milestone 483)**: two-step cache-only clear/repair, with a confirmation-boundary test.
6. Web Capability Matrix — **✅ Shipped (Milestone 482)**: closed platform/runtime declarations drive the generated README/SECURITY tables and registry helpers.
7. Desktop-Only Feature Badges — **✅ Shipped (Milestone 486)**: tool and control badges, Settings/palette indicators, and browser capability facets.
8. Open in Desktop DUDE Deep Link — **✅ Shipped (Milestone 486)**: navigation-only tool/settings/pipeline/project/template links with an opt-in button and download fallback.
9. Install-as-PWA Support — **✅ Shipped (Milestone 486)**: install prompt, generated manifest shortcuts, file/protocol handlers, and a one-time deck hint.
10. Offline Local Utility Support — **✅ Shipped (Milestone 483)**: readiness indicators, explicit tool/category/all caching, graceful uncached and stale-load states.
11. GitHub Pages Direct-Route Recovery — **✅ Shipped (Milestone 484)**: query/fragment fidelity through the 404 redirect and service-worker navigation fallback.
12. Shareable Tool Routes — **✅ Shipped (Milestone 484)**: bare-route copy and capped, compressed `#in=` text-input links with policy-respecting prefill.
13. Browser-Safe Pipeline Execution — **✅ Shipped (Milestone 485)**: offline/runtime gating, abort and worker offload, and intermediate size limits.
14. Browser-Safe Workspace Support — **✅ Shipped (Milestone 485)**: bundle export/import, live multi-tab store sync, and capability-aware panel restore.
15. Web/Desktop Parity Tests for Shared Tools — **✅ Shipped (Milestone 487)**: registry-wide pipeline parity, colocated golden fixtures, and web/native filesystem adapter cases with a coverage rule.

Goal achieved: preserve the convenience of a URL while keeping browser limits explicit and desktop capabilities available through deliberate handoff.

<a id="phase-27"></a>

## Phase 27 — Networking Toolkit

**Status:** ✅ Complete — shipped as Milestones 489–508

Give DUDE a native network-diagnostics surface that a sandboxed browser cannot provide on its own. The emphasis is local diagnostics and explicit, user-directed checks against hosts/services rather than broad or autonomous scanning.

**Foundation (Milestone 489):**
- a typed `NetworkDiagnosticsService` and `dude:network:*` preload/IPC bridge with prepare/start/cancel and ordered job events (progress, result, error, done);
- main-process validation of targets, limits, and job ownership;
- independent DNS resolvers;
- a bundled `network-icmp.exe` Windows ICMP helper, packaged in NSIS and MSIX and loopback-tested in release CI;
- one shared `app-network-workbench` component used by all 18 routes;
- the closed `native-network` platform capability and the new `remote-write` consequence class;
- explicit-save network history and ZIP bundle export.

1. **Ping** — **✅ Shipped (Milestone 490)**: IPv4/IPv6 ICMP echo through the bundled helper.
2. **Traceroute** — **✅ Shipped (Milestone 491)**: hop-limited ICMP probes, up to 30 hops.
3. **DNS Lookup** — **✅ Shipped (Milestone 492)**: the system resolver, or a custom classic DNS, DoH, or DoT server, with strict TLS and bounded timeouts. Custom servers use independent resolvers and never change Windows DNS settings.
4. **Reverse DNS Lookup** — **✅ Shipped (Milestone 493)**: PTR queries for IPv4 and IPv6 through the same resolver choices.
5. **MX / TXT / SRV / NS / CNAME Lookup** — **✅ Shipped as part of DNS Lookup (Milestone 492)**: these record types are a DNS Lookup option (A, AAAA, MX, TXT, SRV, NS, CNAME), not a separate route.
6. **DNS Propagation Tester** — **✅ Shipped (Milestone 494)**: compares one record across labeled Cloudflare, Google, and Quad9 presets plus an optional custom resolver. It reports differences between those resolvers and does not claim global propagation.
7. **TCP Port Tester** — **✅ Shipped (Milestone 495)**
8. **UDP Port Tester** — **✅ Shipped (Milestone 496)**: silence is reported as "open or filtered," never "open."
9. **Port Scanner** — **✅ Shipped (Milestone 497)**, tagged `network-scanning`:
   - one host, or an IPv4/IPv6 CIDR of at most 16 addresses;
   - up to 64 ports, and at most 1,024 host × port × protocol probes;
   - TCP, UDP, or both, with at most 16 concurrent probes.

   An over-limit CIDR is rejected, never truncated. A preview shows the exact targets, ports, protocols, and probe count, and the run needs a separate, single-use confirmation.
10–15, 17. **Local Port / Active Connections / Listening Process / ARP Table / Route Table / Network Interface Viewers and Local IP Detector** — **✅ Shipped as one Local Network tool (Milestone 498)**: seven views built on read-only Windows `Get-Net*` queries and Node's interface list. It runs with current permissions first. **Relaunch as Administrator** is a deliberate action that marks the elevated session, and nothing reruns after a relaunch or a refused UAC prompt. **Updated by Phase 31 (Milestone 597), a deliberate behavior change:** the ports, connections and processes views now read the `windows-sys` helper's `net.tcp`/`net.udp` tables and `process.list` (the same source as Port → Process Lookup), while neighbors, routes and interfaces run as fixed PowerShell 7 scripts. Those three views therefore now require PowerShell 7 and show a "PowerShell 7 required" notice when it is missing; Windows PowerShell 5.1 is no longer used. The Network Diagnostic Bundle's local section follows.
16. **Public IP Detector** — **✅ Shipped (Milestone 499)**: queries IPv4 and IPv6 separately, only on Run.
18. **Hostname Resolver** — **✅ Shipped (Milestone 500)**: OS resolution (`dns.lookup`), kept distinct from DNS record queries.
19. **WHOIS Lookup** — **✅ Shipped (Milestone 501)**: prefers IANA-discovered RDAP, with a bounded TCP/43 referral fallback and an optional custom server.
20. **TCP/HTTP Connectivity Tester** — **✅ Shipped (Milestone 502)**, tagged `remote-write`:
    - any HTTP method, with optional headers and body;
    - strict TLS by default;
    - methods other than GET and HEAD get a preview and a separate confirmation;
    - request bodies are capped at 1 MB and streamed responses at 50 MB;
    - the full response can be downloaded during the session;
    - credential headers are never persisted.
21. **Continuous Ping / Latency Graph** — **✅ Shipped (Milestone 503)**: one probe per second for five minutes by default, capped at one hour.
22. **Packet-Loss Measurement** — **✅ Shipped (Milestone 504)**: 20 probes by default, capped at 100.
23. **MTU Discovery** — **✅ Shipped (Milestone 505)**: a binary search with don't-fragment ICMP probes. An inconclusive probe is reported as unknown.
24. **Route Comparison** — **✅ Shipped (Milestone 506)**: two targets, or before/after runs for one target.
25. **Network Diagnostic Bundle Export** — **✅ Shipped (Milestone 507)**: exports a ZIP of JSON, Markdown, timestamps, and a check manifest after a field preview and a private-data warning.
    - Guided collection runs selected local and remote checks for one explicit target.
    - Its optional scan preset (TCP 22, 80, 443, 3389, 8080) can be edited or disabled before confirmation.
    - HTTP bodies are included only when explicitly selected.
    - The bundle is tagged `network-scanning` because the guided scan is available.

<a id="notes-18"></a>

### Notes

IP/CIDR/subnet math, MAC-address inspection, and IPv4↔integer conversion are pure computation and remain browser-safe capabilities; Phase 19 already contains those kinds of text/math networking utilities. This phase is specifically for live diagnostics that require native socket, interface, routing-table, process, or ICMP access.

**Scope ceiling:** DUDE is for local diagnostics and user-directed checks, not an offensive network-scanning platform. Phase 27 enforces this with the fixed budgets above, applied in the main process and to public and private CIDRs alike. There is no sweep beyond 16 addresses, and no service fingerprinting. A later phase that wants larger ranges or service fingerprinting must change this scope explicitly rather than by raising a constant. *(Amended by Phase 28: the "no background or scheduled check, and no check that outlives its route" rule is narrowed — the Phase 28 Certificate Watch List may run opt-in background checks, process-lifetime only, ≥6 h apart, ≤50 endpoints, one handshake each; see the Phase 28 scope amendment. Nothing else runs in the background.)*

**Delivery notes:**
- 25 roadmap items became 18 routes. Items 5, 10–15, and 17 were folded into DNS Lookup and Local Network, where they are options or views of one check rather than separate tools.
- Windows is the only supported desktop platform. On the web, every route stays discoverable (deck, search, Ctrl+K) and shows a desktop handoff without making a network request.
- Runs stay in memory unless the user clicks **Save to History**. Saved history holds at most 100 selected snapshots, for 30 days or 50 MB, without request headers, request bodies, or downloaded HTTP bodies. Restoring a snapshot never reruns it.
- The generated registry, README, and SECURITY tables were regenerated only once, in Milestone 507, so individual tool commits 490–506 aren't discoverable checkouts on their own.
- All 18 tools ship at `experimental` status.
- Milestone 508 added per-tool `network` disclosure metadata, so the generated SECURITY network table lists every tool that contacts a host.
- Still unverified: UAC acceptance and refusal, and direct desktop routes in the packaged app, both of which need manual testing.

**Goal achieved:** DUDE can answer "is this host/service/network path actually reachable?" from one desktop surface, with explicit targets, bounded probes, and nothing running in the background.

<a id="phase-28"></a>

## Phase 28 — DNS & Live TLS / Certificate Tools

**Status:** ✅ Complete — shipped as Milestones 509–522

Extend DUDE's file-based certificate inspection (Phase 12) with **live, socket-level checks against running services**. Static PEM/DER/PFX parsing stays a browser-safe workflow; this phase is the **live-endpoint layer**: deeper DNS (DNSSEC, CAA, email auth), TLS handshake and cipher inspection, chain/revocation/CT retrieval, STARTTLS, and DUDE's first background network check. Every live check reuses the Phase 27 bridge and the shared `electron/network-*.ts` clients, exposes the exact host/resolver/service contacted ([Network-dependent tools](../product/PRODUCT_SPEC.md#network-dependent-tools), [API Integration Architecture](../architecture/SYSTEM_ARCHITECTURE.md#api-integration-architecture)), and stays desktop-only with a web handoff.

**Foundation (Milestone 509):**
- the DNS wire client (`electron/network-dns.ts`) gained EDNS0 with the DO/CD bits, a UDP transport with TCP fallback on truncation, authority/additional sections and AD/TC/RA/CD flags, real TTLs and rcodes, and typed decoders for SOA, CAA, DNSKEY, DS, RRSIG, NSEC, NSEC3, TLSA and HTTPS/SVCB. `"system"` now queries the OS-configured servers over the wire. Per-transport diagnostics report DoH HTTP status and DoT TLS details;
- the DNS resolver is now validated for every DNS kind (previously unvalidated), and the DoH/DoT/wire paths gained specs;
- `electron/network-tls.ts` performs the inspection handshake (`rejectUnauthorized:false`, then separate trust verdicts against the bundled Mozilla roots **and** the Windows store), with a byte tap for the handshake timeline, session-only mTLS identities, stapled-OCSP capture, and hostname-mismatch analysis;
- a minimal DER reader (`electron/der.ts`) for CRL distribution points, SCTs, OCSP and CRL;
- the shared `app-network-workbench` gained pluggable form / request-builder / result-template slots, a "Contacting:" disclosure strip, and a raw-JSON toggle (Phase 27 tools are unchanged); shared `cert-chain-view` and `findings-list` components;
- run history never stores client identities, pasted mail headers, or packet captures.

Twenty-four roadmap items became **eleven routes** (two extended in place, nine new):

1. **DNS Record Explorer (live)** — **✅ Shipped as DNS Lookup extensions (Milestone 510)**: all 17 record types, a typed response view (flags, sections, EDNS), and per-transport diagnostics.
2. **DNSSEC Inspector** — **✅ Shipped (Milestone 511)**: full local chain-of-trust validation from the embedded IANA root KSKs, RRSIG/DS/DNSKEY verification (RSA/ECDSA/Ed25519), and NSEC/NSEC3 denial-of-existence proofs. The resolver only transports the records; its AD bit is shown next to the local verdict.
3. **CAA Inspector** — **✅ Shipped as a DNS Lookup analysis view (Milestone 510)**: RFC 8659 tree-climb, issue/issuewild/iodef, and a "can this CA issue?" check. Reused by the HTTPS Analyzer.
4. **DKIM Inspector** / 5. **SPF Inspector** / 6. **DMARC Inspector** — **✅ Shipped as one Email Auth Inspector (Milestone 512)**, three tabs of one run: SPF include tree with the 10-lookup limit and `check_host()` evaluation; DKIM keys by selector, pasted header, or a reviewed common-selector probe; DMARC with PSL organizational-domain fallback and external-report authorization.
7. **DNS-over-HTTPS Tester** / 8. **DNS-over-TLS Tester** — **✅ Shipped as DNS Lookup transport options with per-transport diagnostics (Milestone 510)**, not separate routes.
9. **Multiple Resolver Comparator** — **✅ Shipped as DNS Propagation extensions (Milestone 510)**: presets, the system resolver, and up to five custom classic/DoH/DoT resolvers, with TTL spread and per-resolver divergent values. Still reports resolver differences, never global propagation.
10. **TLS Connection Inspector** / 11. **Cipher Suite Inspector** / 12. **TLS Version Tester** / 13. **ALPN Inspector** / 14. **SNI Tester** / 22. **TLS Handshake Timeline** — **✅ Shipped as one TLS Connection Inspector (Milestones 513–515)**: connection (version/cipher/ALPN/SNI), a handshake timeline from raw record bytes, mTLS, and HTTP/3 via the Chromium network stack (M513); gated cipher/version **enumeration** with a configuration weakness report (M514); and an elevated-only pktmon **packet capture** to pcapng (M515).
15. **HTTPS Configuration Analyzer** — **✅ Shipped (Milestone 520)**: one composite, gated run producing pass/warn/fail findings (versions, ciphers, chain, hostname, expiry, OCSP stapling, HTTP→HTTPS redirect, HSTS, CAA, HTTPS/SVCB) with **no letter grade**.
16. **Live Certificate Chain Fetcher** / 23. **Certificate/Hostname Mismatch Analyzer** — **✅ Shipped as one Live Certificate Chain Fetcher (Milestone 516)**: fetches the full presented chain (direct or via STARTTLS), the dual-store trust verdicts, the wildcard/IP-SAN/near-miss hostname analysis, and an incomplete-chain/AIA hint, with hand-offs to the Phase 12 tools and to Revocation/CT/Watch.
17. **Certificate Expiration Monitor** / 24. **Local Certificate Watch List** — **✅ Shipped as one Certificate Watch List (Milestone 521)**, DUDE's first background network check (see the amended scope note below).
18. **OCSP Inspector** / 19. **CRL Inspector** — **✅ Shipped as one Certificate Revocation Inspector (Milestone 517)**, plus AIA issuer fetch: builds and verifies OCSP (issuer or delegated responder), parses and verifies CRLs, and contacts only the URLs named inside the certificate, over HTTP.
20. **Certificate Transparency Lookup** — **✅ Shipped (Milestone 518)**: decodes embedded SCTs locally and names each log from a bundled list; domain history via crt.sh (a disclosed third party) or a custom endpoint.
21. **STARTTLS Inspector** — **✅ Shipped (Milestone 519)**: SMTP, IMAP, POP3, FTP, LDAP, PostgreSQL, MySQL and XMPP, showing the negotiation transcript and then the TLS layer.

<a id="notes-19"></a>

### Notes

The certificate tools in Phase 12 operate from user-supplied PEM/DER/PFX material and stay entirely local/browser-safe. Phase 28 is the live-endpoint layer that contacts a running service, and every route inherits the standing network-disclosure rules in [Offline Behaviour](../product/PRODUCT_SPEC.md#offline-behaviour) and [API Integration Architecture](../architecture/SYSTEM_ARCHITECTURE.md#api-integration-architecture).

**Delivery notes:**
- Each tool commit ran `generate:registry`, so the sidebar, search, palette, README and SECURITY tables track the tools (fixing a Phase 27 discoverability gap).
- All eleven routes ship at `experimental` status. Trust verdicts are reported against both the bundled Mozilla roots and the Windows system store, labeled separately, so corporate/MITM roots are visible.
- Because Electron's TLS library (BoringSSL) omits many legacy suites, cipher/version enumeration reports anything it cannot offer as **"not testable from this client"**, never as unsupported.
- Cipher/version enumeration, the HTTPS Analyzer (which enumerates), and packet capture are tagged `network-scanning`/`process-management` and gated by a main-process preview and single-use confirmation. Packet capture also requires the elevated session.
- Bundled reference data (`electron/data/`: the Public Suffix List snapshot for DMARC, the CT log list) is refreshed by `scripts/refresh-network-data.mjs` and committed with its retrieval date; nothing is downloaded at runtime for those steps.
- **Still unverified (needs manual desktop testing):** the watch-list background firing, notifications and tray badge; the elevated pktmon capture and its UAC path; and how much HTTP/3 detail the Chromium net stack exposes.

**Scope amendment to Phase 27's ceiling ([Phase 27](#phase-27) Notes).** Phase 27 stated "no background or scheduled check, and no check that outlives its route." Phase 28 amends this **narrowly and explicitly**: the Certificate Watch List (items 17/24) may run background checks, but only opt-in, only while the DUDE process is alive (window open or hidden to tray), at most every 6 hours, for at most 50 endpoints, as a single TLS handshake each — no launch-on-login, no service, no OCSP/CT follow-ups in the background. Phase 28 also adds config-weakness findings (legacy versions, RC4/3DES, weak DH, missing extensions) derived from normal or enumerated handshakes; consistent with Phase 27's "not an offensive scanning platform" ceiling, **no probe triggers a server bug, reads leaked memory, or stresses the server.**

**Goal achieved:** static certificate inspection and live-endpoint troubleshooting are unified — DUDE can answer "what does this endpoint actually present, is it trusted, is it revoked, and when does it expire?" from one desktop surface, with explicit targets and bounded, mostly foreground checks.

<a id="phase-29"></a>

## Phase 29 — Filesystem & Binary Forensics at Scale

**Status:** ✅ Complete — shipped as Milestones 523–536

Phase 29 covers filesystem operations that need arbitrary, persistent, background, recursive, watch, or write access beyond a single user-picked file/folder snapshot. This phase also consumes the native file-watch infrastructure established in Phase 8.

1. **Folder Size Analyzer** — recursive, across an arbitrary directory tree — **✅ shipped (M525)** via `folder-size-analyzer`.
2. **Duplicate File Finder** — across a drive or arbitrary tree — **✅ shipped (M528)** via `duplicate-files`.
3. **Batch Rename** — pattern-based, across a selected tree — **✅ shipped (M530)** via `batch-rename`.
4. **Directory Tree Generator** — for an arbitrary path, not only a one-shot picked folder — **✅ shipped (M526)** via `directory-tree-generator`.
5. **File Splitter** — **✅ shipped (M532)** via `file-split-join`.
6. **File Joiner** — **✅ shipped (M532)** via `file-split-join`.
7. **Line-Ending Batch Converter** — across a folder of files — **✅ shipped (M531)** via `batch-text-converter`.
8. **File Encoding Batch Converter** — across a folder/tree — **✅ shipped (M531)** via `batch-text-converter`.
9. **Directory Hash** — whole-folder content hash for tree comparison — **✅ shipped (M527)** via `hash-manifest`.
10. **Watched Folder Workspace** — **✅ shipped (M534)** via `watched-folders`.
11. **Auto-Rescan Directory Diff** — **✅ shipped (M535)** via `directory-diff`.
12. **Git Repo Browser Auto-Refresh** — **✅ shipped (M535)** via `git-diff`.
13. **File Change Timeline** — **✅ shipped (M534)** via `watched-folders`.
14. **Large-File Streaming Inspector** — **✅ shipped (M533)** via `large-file-inspector`.
15. **Bulk Hash/Manifest Generator** — **✅ shipped (M527)** via `hash-manifest`.
16. **Folder Snapshot / Snapshot Diff** — **✅ shipped (M527)** via `hash-manifest`.
17. **Duplicate Content Groups** — **✅ shipped (M528)** via `duplicate-files`.
18. **Content Search Across Selected Tree** — **✅ shipped (M529)** via `tree-search`.
19. **Structured File Search** — **✅ shipped (M529)** via `tree-search`.
20. **Safe Batch Operation Preview / Dry Run** — **✅ shipped (M524)** via `batch-operations`.

<a id="notes-20"></a>

### Notes

Session folder grants remain the default; a user can explicitly remember and revoke a folder. Cancellable scans, searches and hashes run in an Electron utility process. Background watches require remembered roots and run only while DUDE is open. Per-root content capture is a separate opt-in with no size, type or secret limit; the tool shows storage usage and offers a clear action. Backups for undo default to 30 days / 5 GB and can be adjusted. Directory Diff and Git Repo Browser auto-rescan only while their views are open and the option is enabled.

Single-file inspection — hex viewing, signature/entropy analysis, MIME/magic-byte detection, BOM handling, and PE/ELF/Mach-O header viewing — remains a browser-safe/upload-driven concern and is covered by the file/binary tooling in Phase 20.

Directory Diff and Git Repo Browser already gained native re-scannable folder access in Phase 8. The distinction here is deeper **filesystem lifecycle access**: watching, streaming, searching, scanning large trees, generating manifests, and performing explicit write-back/batch mutations.

Every mutating batch operation now shows a preview with exact affected paths and requires a separate confirmation before writes. The shared engine checks preconditions, journals outcomes and supports previewed undo; deletes go to the Recycle Bin (see [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract)).

**Goal achieved:** DUDE's file tools now support persistent native filesystem workflows.

<a id="phase-30"></a>

## Phase 30 — Workbench Shell, Tool Discovery, Local Insights & Appearance

**Status:** ✅ Complete — shipped as Milestones 537–592

Rework DUDE's primary shell surfaces so the application behaves like a dense developer workbench rather than a scrollable catalog of hundreds of tools.

Phases 24–25 already established the underlying product model: Smart Paste, Recently Used Tools, Favorites, Pinned Pipelines, Quick Run, Unified Recents, Workspace Templates, Projects, native actions, and a multi-source Command Palette are all first-class capabilities. Phases 30A–30L complete that transition visually and structurally.

The Deck/Home route must stop treating the complete tool registry as its dominant content. In the shipped default layout, the user's most likely next actions — paste/drop something, resume recent work, launch a favorite, run a workflow, reopen a project/workspace, or search — should occupy the primary viewport. The complete tool inventory remains fully accessible, searchable, keyboard-navigable, and bookmarkable through a dedicated dense browser.

The workbench redesign portion of Phase 30 (30A–30J) started from the then-fixed dark, bright, category-colored visual system and the existing [Appearance System](../product/UX_SPEC.md#appearance-system) density contract. It refined spacing, layout, component proportions, panel treatment, and information hierarchy without depending on light mode, user-selectable density presets, font customization, theme import/export, or per-tool visual customization. Phase 30K (Milestones 577–585) then shipped those platform-level appearance capabilities, with Dark and the 30J Compact density kept as the defaults; per-tool visual customization remains prohibited so the shared token/system contract stays authoritative.

### Product rule

> **Home answers "what do I want to do now?" Browse Tools answers "what does DUDE contain?"**

The complete registry must never again be the primary visual hierarchy of the Home route.

### Scope boundaries

The following appearance capabilities are included in Phase 30K (shipped) rather than treated as non-goals: light mode, accent-palette selection, user-selectable density presets, and font selection. Theme customization is included only in the controlled, token/system-driven form defined in Phase 30K; arbitrary theme customization remains out of scope. Customization means composing first-party, pre-validated options per axis. Free color pickers, a user token editor, arbitrary user themes, per-tool themes, and bundled web fonts remain out of scope.

Phase 30 deliberately does **not** include:

- arbitrary theme customization;
- arbitrary HTML/JavaScript or scriptable custom widgets;
- third-party dashboard plugins;
- cloud analytics;
- telemetry;
- gamification;
- cross-user usage comparison;
- AI-generated dashboard layouts;
- replacing Command Palette;
- replacing Smart Paste;
- replacing dedicated tool routes;
- turning Home into a source-code IDE;
- hiding tools from the complete catalog.

Users can freely arrange first-party panels and create text, link, and shortcut panels in Phase 30I. Scriptable/third-party widget runtimes require a separate execution and permission model. Theme and density customization are defined, and shipped, in Phase 30K, within the ceiling above.

### Subphase sequence

These twelve subphases follow the dependency order below. Each has its own exit criteria and phase-local requirement numbers. The product rule and scope boundaries above apply throughout.

| Phase | Deliverable |
|---|---|
| 30A | Browse Tools Foundation |
| 30B | Sidebar and Command Palette Navigation |
| 30C | Shared Workbench Primitives |
| 30D | Bounded Default Home |
| 30E | Compact Smart Entry |
| 30F | Personal Launch and Resume |
| 30G | Quick Run on Home |
| 30H | Local Workbench Insights |
| 30I | User-Designed Home |
| 30J | Density, Color, and Spacing |
| 30K | Theming, Appearance, and Accessibility Expansion |
| 30L | Integrated Scale, Accessibility, and Platform Verification |

<a id="phase-30a"></a>

### Phase 30A — Browse Tools Foundation

#### 30A.1 Dedicated Browse Tools Route

Introduce or elevate a dedicated full-registry browser so Home no longer has to render the entire tool catalog.

Recommended route:

```text
/tools
```

or the closest route consistent with the existing router.

Requirements:

- all registered tools visible;
- search/filter state can be represented in the UI;
- stable direct tool routes remain unchanged;
- keyboard navigation;
- category filtering;
- platform filtering;
- capability filtering where useful;
- status/confidence filtering;
- Favorites filtering;
- Recently Used filtering;
- deterministic sorting;
- no hard-coded tool inventory outside the registry.

This becomes the authoritative complete catalog surface.

#### 30A.2 Browse Tools View Modes

Provide at least two high-density views.

##### Compact Table

Recommended columns:

| Favorite | Tool | Category | Platform | Status | Capability summary |
|---|---|---|---|---|---|

Target row height should remain compact enough to show many tools at normal desktop scale without sacrificing readability or focus visibility.

##### Compact Grid/List

Use smaller multi-column tool entries for users who prefer visual scanning.

A tool entry may contain:

- title;
- category accent;
- one-line description only where useful;
- platform/capability indicator;
- status;
- favorite action.

Do not restore the current large category-wall card treatment inside this view.

Persist the user's selected Browse Tools view mode as a safe UI preference.

#### 30A.3 Deterministic Tool Filtering

Tool browser filtering must become powerful enough that hundreds of tools remain manageable.

Support filtering by available metadata such as:

- text/title/keyword;
- category;
- desktop/web availability;
- capability;
- verification/status;
- Favorite;
- Recent;
- input/output compatibility where registry metadata makes this practical.

Optional power-user query syntax may support forms equivalent to:

```text
category:security jwt
platform:desktop tls
status:verified csv
favorite:true
accepts:json
```

If query syntax is implemented:

- plain text search must remain sufficient;
- invalid operators should degrade safely rather than produce errors;
- syntax must be documented in a compact help affordance;
- filtering remains entirely local.

#### 30A.4 Tool Sorting & Local Recommended Ranking

Provide deterministic sort modes such as:

- Recommended;
- Recently Used;
- Most Used;
- Favorites First;
- A–Z;
- Category.

"Recommended" must be explainable and local.

A recommendation score may combine existing signals such as:

- favorite status;
- usage frequency;
- recency;
- current category/filter context;
- Smart Paste/input compatibility when applicable.

Do not introduce opaque ML, remote recommendation services, or hidden telemetry.

Stable tie-breaking is required so the interface does not reorder unpredictably.

#### 30A.5 Compact Search & Filter Bar

Browse Tools should have one persistent compact discovery bar containing:

- search;
- category;
- platform/capability filters;
- sort;
- view-mode switch.

Avoid placing each filter in a separate large card.

Desktop layout should generally keep these controls on one or two compact lines.

Keyboard requirements:

- `/` may focus tool filtering when it does not conflict with an active editor/input;
- Escape clears/dismisses the active filter state where appropriate;
- arrow keys may move through result rows;
- Enter opens selected tool;
- favorite toggles must remain keyboard reachable.

Ctrl+K continues to open the global Command Palette.

#### 30A.6 Registry-Driven Counts & Metadata

All displayed totals must be generated from live application data.

Examples:

- `All tools — N`;
- category counts;
- desktop-only count;
- browser-safe count;
- verified count;
- favorite count.

Do not hard-code "277" or any other current tool count into shell templates.

Counts must update automatically as new tool manifests are registered.

#### 30A.7 Platform/Capability Visibility

Compact discovery surfaces should continue to communicate when a tool is:

- Web + Desktop;
- Desktop-only;
- browser-limited;
- dependent on native capability;
- unavailable in the current surface.

Use the existing closed capability vocabulary and PlatformCapabilityBadge model rather than introducing dashboard-specific platform labels.

Badges must stay compact enough that capability metadata does not dominate tool rows.

#### 30A.8 Route & Deep-Link Stability

No existing dedicated tool route may change because of this redesign.

Existing:

- browser bookmarks;
- back/forward behavior;
- GitHub Pages route recovery;
- `dude://` tool links;
- project links;
- pipeline links;
- workspace links

must continue to resolve.

If a dedicated `/tools` catalog route is added, it supplements rather than replaces existing per-tool URLs.

Category/filter URLs may be shareable where this can be implemented without encoding sensitive search contents.

#### Exit criteria

- [x] A dedicated Browse Tools surface exposes every registered tool.
- [x] Browse Tools supports search, category filtering, deterministic sorting, and at least Compact Table + Grid/List views.
- [x] Category counts and total tool counts are registry-derived.
- [x] Existing dedicated tool routes remain unchanged.
- [x] Browse Tools remains usable with a synthetic 1,000-tool registry where practical.

<a id="phase-30b"></a>

### Phase 30B — Sidebar and Command Palette Navigation

#### 30B.1 Sidebar Information Architecture Rewrite

The persistent sidebar must stop duplicating the complete registry as an always-expanded tree.

Primary shell destinations remain directly visible:

- Home;
- Smart Paste;
- Workspace;
- History / Recents;
- Pipelines;
- Quick Run;
- Projects;
- Settings.

Tool discovery in the sidebar becomes category/index based.

Recommended shape:

```text
TOOLS
Data                    48
Text                    31
Encoding                27
Security                39
Date & Time             …
Web                     …
Developer               …
Documents               …
Browse all              277
```

Requirements:

- category count derived from the registry;
- selecting a category opens/filters the tool browser;
- active category state visible;
- complete individual tool lists are not permanently expanded;
- optional explicit category expansion may exist, but collapsed/index navigation is the default;
- Favorites and Recents may receive compact sidebar entry points;
- sidebar remains useful at normal zoom without its own enormous tool-scroll wall.

#### 30B.2 Command Palette Remains the Expert Fast Path

The redesigned Home and Browse Tools UI must not reduce the importance of Ctrl+K.

Command Palette remains the fastest path when the user knows what they want.

Surface the shortcut clearly but compactly in:

- global search affordance;
- Browse Tools;
- optionally Home header/search.

Do not duplicate command-source logic inside Home.

Tools, navigation, projects, workspaces, pipelines, native operations, recents, and preferences continue to enter the palette through the established `CommandSource` architecture.

<a id="exit-criteria-2"></a>

#### Exit criteria

- [x] The sidebar no longer defaults to displaying hundreds of individual tool links.
- [x] Ctrl+K remains the fastest universal launcher, regardless of Home layout.

<a id="phase-30c"></a>

### Phase 30C — Shared Workbench Primitives

Complete these shared primitives before the Home surfaces in Phases 30D–30H consume them.

#### 30C.1 Shared Dashboard Panel Primitive

Create a small shared dashboard/workbench panel primitive rather than building each Home section as unrelated CSS.

The primitive should support:

- compact title/header;
- optional icon/category/status accent;
- optional item/count summary;
- primary body region;
- optional compact action area;
- optional "View all";
- loading state;
- empty state;
- keyboard/focus behavior.

Avoid:

- oversized padding;
- heavy shadows;
- decorative gradients;
- excessive radius;
- duplicated card-specific spacing systems.

The primitive should be usable by Home and other dashboard-like surfaces without forcing every tool workspace into a card layout.

#### 30C.2 Compact Table Primitive Expansion

Reuse or extend the existing shared data-table pattern for shell-level tables.

Shell tables should support where useful:

- sticky compact header;
- keyboard row focus;
- sorting;
- dense row height;
- truncation with accessible full-value disclosure;
- category/status badges;
- inline primary action;
- virtualization when row count justifies it.

Do not build a second table component solely for Home if the existing shared primitive can be evolved safely.

#### 30C.3 Dashboard Visualization Primitive

Introduce a very small shared visualization layer for workbench metrics.

Initial required chart classes:

- sparkline / small time trend;
- horizontal ranked bars.

Optional future classes may be added when a real use case exists.

Requirements:

- charts read shared design tokens;
- charts support dark-theme contrast (since Phase 30K, every theme and contrast mode: the shared charts re-read token colors when `AppearanceService.revision()` changes);
- charts have text equivalents;
- chart colors retain semantic/category meaning;
- no decorative gradients/glow;
- no arbitrary per-dashboard color choices;
- tool code does not need to depend on the dashboard package.

Prefer a lightweight implementation over adding a large dashboard/chart dependency unless the dependency materially reduces complexity and remains appropriately lazy-loaded.

<a id="exit-criteria-3"></a>

#### Exit criteria

- [x] Home panels share one compact panel primitive with loading, empty, action, and keyboard states — `app-dashboard-panel` (`shared/components/dashboard-panel/`), M549.
- [x] Shell tables reuse or extend the shared table pattern; local insights use small token-driven charts with text equivalents — `app-data-table` (`shared/components/data-table/`, unified from the former `app-data-table`/`app-tool-table` split, M550–M552) and `app-sparkline-chart`/`app-ranked-bars-chart` (`shared/components/workbench-charts/`, M553).

Shipped M549–M553. A dev-only `/dev/primitives-preview` route (gated by `isDevMode()`, never reachable in a production build, not registered in the sidebar/search/command-palette) exercises all three primitives together — removed, with `src/app/dev-preview/`, in Milestone 587 (Phase 30L) once the real Home panels, tables and charts exercised the primitives directly.

<a id="phase-30d"></a>

### Phase 30D — Bounded Default Home

#### 30D.1 Workbench Home Information Architecture

Replace the current "Smart Paste followed by the complete category/tool wall" hierarchy with a workstation dashboard. The shipped default Home layout is intentionally compact and bounded; users can redesign it with the Home Layout builder in Settings.

The default layout prioritizes:

1. compact global shell/search context;
2. **Give it to DUDE** smart-entry surface;
3. Favorites / Recently Used;
4. Recent Projects / Recent Workspaces / Pinned Pipelines;
5. Quick Run;
6. local activity/usage summary;
7. compact Browse Tools preview;
8. explicit **Browse all tools** entry into the dedicated tool browser.

This order describes the default preset, not a constraint on user-authored layouts. Home does not automatically render the entire registered tool inventory.

All tools remain discoverable through:

- Ctrl+K / Command Palette;
- global search;
- category navigation;
- the dedicated Browse Tools surface;
- Smart Paste/file-drop recommendations;
- Favorites/Recents where applicable;
- direct routes and `dude://` links.

#### 30D.2 Above-the-Fold Workbench Contract

At normal desktop zoom, the shipped default Home layout should expose useful work without immediate scrolling.

Default-layout targets for the canonical desktop application:

- at 1920x1080 / 100% scale, compact Smart Entry, Favorites/Recently Used, one Resume Work surface (or a compact start-work action when history is empty), and Quick Run are visible without scrolling;
- at 1440x900 / 100% scale, compact Smart Entry, Favorites/Recently Used, and one Resume Work surface (or a compact start-work action when history is empty) are visible without scrolling;
- at 1366x768 / 100% scale, the first useful action is visible immediately and controls remain usable;
- normal use does not depend on zooming below 100%;
- no horizontal page scrolling at supported desktop widths.

Charts, tables, and the catalog preview may sit below the first viewport. The page may scroll for secondary information.

User-authored layouts may move, resize, or hide panels and are not required to preserve the default order or first-viewport composition. They must still avoid horizontal overflow, clipped or unreachable controls, and inaccessible actions. Global navigation, Browse Tools, and Ctrl+K remain available regardless of Home layout.

#### 30D.3 Category Preview Instead of Category Wall

Home may retain a **Browse Tools preview**, but it must be bounded.

Two acceptable models:

##### A. Category strip

```text
Data 48   Text 31   Encoding 27   Security 39   Web 34 ...
```

Clicking a category opens Browse Tools filtered to that category.

##### B. Compact category previews

Each category shows only a small bounded number of representative tools, for example:

- top/recent tools in that category;
- up to 4–6 entries;
- category count;
- "View all N →".

Under no circumstances should Home render every tool from every category simply because all registry entries exist.

#### 30D.4 Visual Hierarchy Audit

The shipped default layout should establish three clear visual levels.

##### Level 1 - Immediate action

- Give it to DUDE;
- global search / Ctrl+K;
- Quick Run.

##### Level 2 - Personal work context

- Favorites;
- Recent Tools;
- Projects;
- Workspaces;
- Pipelines;
- Local activity.

##### Level 3 - Catalog/discovery

- categories;
- Browse Tools;
- complete registry.

A screenshot of the default layout should make these levels evident without explanation. User-authored layouts may choose a different hierarchy; the editor should make panel purpose and available actions clear without imposing the default order.

<a id="exit-criteria-4"></a>

#### Exit criteria

- [x] Default Home no longer renders the complete registry as its dominant content.
- [x] Default Home at 1920x1080 / 100% shows Smart Entry, Favorites/Recents, one resume surface or compact start-work action, and Quick Run without scrolling.
- [x] Default Home at 1440x900 / 100% shows Smart Entry, Favorites/Recents, and one resume surface or compact start-work action without scrolling; 1366x768 remains usable without horizontal overflow.

Shipped as Milestones 555-557 (Personal/Resume layer, Action layer, Catalog layer + wall removal). Per this phase's scope decision, 30D also absorbed a compact idle Smart Entry (30E), a unified Resume Work panel (30F), and a Quick Run panel (30G) rather than shipping them as placeholders — see those phases' own exit criteria. Milestone 556 additionally added a compact Activity panel (opens-over-time sparkline + most-used-tools ranked bars) reading the existing `UsageService` log directly; this satisfies 30D.1's "local activity/usage summary" bullet but is intentionally lighter-weight than 30H.2's fuller requirements (a dedicated rolling daily-bucket store, incomplete-period labeling, schema migration) — 30H remains open for that deeper work.

<a id="phase-30e"></a>

### Phase 30E — Compact Smart Entry

#### 30E.1 Compact "Give it to DUDE" Surface

Preserve Smart Paste/file-drop as the primary entry mechanism, but substantially reduce its idle footprint.

Idle state:

- one compact paste/input region;
- one compact file/drop affordance;
- short supported-input hint;
- no large empty textarea or oversized drop target;
- target approximately one compact dashboard row rather than a large hero card.

Focused/active state:

- expand the paste region when the user enters substantial content;
- surface Smart Paste classification/results as today;
- preserve drag/drop behavior;
- preserve web/desktop capability differences;
- preserve privacy behavior;
- collapse back to its compact state when no longer active where doing so does not destroy user input.

The visual treatment must remain a developer-workbench control, not a marketing-site hero.

<a id="exit-criteria-5"></a>

#### Exit criteria

- [x] A user can paste/drop something immediately from default Home.
- [x] Smart Paste/file-drop behavior remains intact.

Shipped as part of Phase 30D (Milestone 555) — the compact idle Smart Entry hero was pulled forward into that phase per its own scope decision; see 30D.1/30D.2.

<a id="phase-30f"></a>

### Phase 30F — Personal Launch and Resume

#### 30F.1 Personalized Launch Surface

Create a compact, high-priority launch region sourced entirely from existing local personalization infrastructure.

It should expose:

- **Favorites**;
- **Recently Used Tools**;
- optionally the most relevant pinned/saved launch targets when useful.

Requirements:

- no separate home-specific copy of favorite state;
- no home-specific usage recorder;
- FavoritesService and UsageService remain authoritative;
- empty sections disappear or collapse rather than reserving blank space;
- items use dense rows or compact tiles;
- title, category accent, relevant capability/status indicator, and optional shortcut/action affordance are enough;
- descriptions should not be repeated when they add little value.

Recommended default visible count:

- 4–8 Favorites;
- 4–8 Recently Used Tools.

Overflow goes to the relevant full surface rather than growing Home indefinitely.

#### 30F.2 Resume Work Surface

Home should make persistent workflows more prominent than raw tool inventory.

Add compact surfaces for:

- **Recent Projects**;
- **Recent Workspaces / Workspace Templates**;
- **Pinned Pipelines**.

These must reuse the stores and recency mechanisms already established by earlier phases.

Do not create duplicate "dashboard project", "dashboard workspace", or "dashboard pipeline" models.

Each panel should have:

- compact title;
- small item count where useful;
- up to a bounded number of recent/pinned items;
- one direct open/apply/run-or-navigate action as appropriate;
- a "View all" destination.

Executing a pipeline must continue to obey its existing confirmation rules. Home presence must never create a new implicit execution path.

#### 30F.3 Empty-State Behavior

Dashboard composition must work cleanly for a new installation with no personal history.

Examples:

- no Favorites → hide/collapse the Favorites panel or show one compact explanatory row;
- no Recent Projects → do not reserve a giant empty card;
- no Pinned Pipelines → compact call-to-action to Pipelines;
- insufficient activity for a trend chart → show a quiet "Activity will appear here as you use DUDE" state;
- no Unified Recents → omit the table body without fake example data.

Never populate charts with fabricated demo activity. Default-layout panels may collapse when empty; a user-placed panel should retain a compact, editable placeholder in layout-edit mode so its position and controls remain understandable.

<a id="exit-criteria-6"></a>

#### Exit criteria

- [x] Favorites and Recently Used Tools are first-class default Home surfaces.
- [x] Projects, Workspaces, and Pinned Pipelines are resumable from default Home where available.

Shipped as part of Phase 30D (Milestone 555's unified Resume Work panel) per that phase's scope decision to consolidate Projects/Workspaces/Pinned Pipelines into one surface rather than three separate rails.

<a id="phase-30g"></a>

### Phase 30G — Quick Run on Home

#### 30G.1 Quick Run as a First-Class Dashboard Control

Promote Quick Run from a destination the user must remember to visit into a compact Home capability.

The Home Quick Run surface should support:

- a compact single input;
- recently/frequently used Quick Run-compatible transformations;
- explicit transform selection;
- run via the same existing execution contract as `/quick-run`;
- open-in-full-Quick-Run action for advanced use.

Do not create separate Home implementations of transform logic.

The Home surface is only a shell over the existing Quick Run execution path.

<a id="exit-criteria-7"></a>

#### Exit criteria

- [x] Quick Run is usable from a compact default Home surface.

Shipped as part of Phase 30D (Milestone 556's Quick Run panel), scoped to the user's own favorited/most-used text-eligible tools rather than eagerly loading the full registry — see `shell/deck/quick-run-panel/quick-run-panel.ts`'s own doc comment.

<a id="phase-30h"></a>

### Phase 30H — Local Workbench Insights

#### 30H.1 Local Workbench Activity Summary

Add a compact local-only activity area so Home feels like a live workbench rather than a static launcher.

Initial summary may include:

- tool opens over the last 7 days;
- unique tools used over the selected period only when a complete time-bounded source exists;
- most-used category;
- most-used tools;
- favorite count;
- pinned-pipeline count;
- recent project/workspace count where useful.

Only display metrics that have a clear practical interpretation.

Avoid generic SaaS vanity metrics such as:

- arbitrary "productivity scores";
- streaks;
- engagement percentages;
- achievement systems;
- remote comparisons;
- fabricated time-saved estimates.

No metric requires remote analytics.

#### 30H.2 Activity Trend Visualization

Add one compact trend visualization for recent local usage.

Preferred initial visualization:

**Tool opens - last 7 days**

Requirements:

- compact sparkline or small line/bar chart;
- one point/bucket per local calendar day;
- restrained chrome;
- meaningful tooltip/details on hover/focus;
- readable without the tooltip;
- no giant chart card;
- no decorative chart animation;
- no remote charting data.

The existing `UsageService` recent-open log is capped at 200 entries and cannot guarantee a complete 7-day count. Extend `UsageService` with bounded daily-open buckets covering a rolling 30-day window, while keeping it the only usage recorder. Record empty days as zero only after reliable tracking begins. Preserve existing lifetime counts and the capped recent log through a schema migration, but do not present a partial reconstruction from that log as a complete period. Persist the start of reliable daily tracking. The chart must label an incomplete period after a first install or migration until seven full local calendar days have been tracked. Its displayed total must use the same complete-or-partial period as the chart.

An example persisted aggregate shape may be equivalent to:

```ts
interface DailyUsageBucket {
  date: string;
  opens: number;
}
```

The exact type is implementation-defined. Usage payloads must never include pasted content, file contents, tool inputs, outputs, secrets, tokens, or user document data.

#### 30H.3 Category Usage Visualization

Add a compact ranked category-usage visualization.

Preferred presentation:

- horizontal bars;
- top categories by locally recorded use;
- category accent color carries category identity;
- category label + count remain text-readable;
- optional "View category" action.

Avoid pie/donut charts when ranking is the main question.

The chart must be derived from registry category metadata plus existing local usage counts rather than introducing manually maintained category mappings. Label it as lifetime usage unless a complete time-bounded category source is added.

#### 30H.4 Top Tools Table

Add a dense local "Top Tools" table or ranked list.

Suggested columns:

| Tool | Category | Uses | Last used | Action |
|---|---|---:|---|---|

Requirements:

- sortable where useful;
- category visually identifiable;
- favorite state may be toggled inline;
- Enter/open action remains keyboard reachable;
- tool routes come from the registry;
- values are local only.

This table is intentionally denser than the Home launch rails and demonstrates the shared compact-table visual language needed elsewhere in DUDE. Label its use counts as lifetime counts.

#### 30H.5 Recent Activity Table

Expose a small Home view over Unified Recents, using only entries with a real event timestamp.

Suggested columns:

| Type | Item | Context | Last activity | Action |
|---|---|---|---|---|

Initial eligible sources are:

- tool opens recorded by UsageService;
- pipeline runs with a recorded run time;
- History entries where already permitted;
- files permitted by the Native File Recent List.

Projects and Workspace Templates remain in their separate resume panels until their actual activation/application events are added to UnifiedRecentsService. Open workspace tabs are not recent activity events: the current derived view assigns them a synthetic "now" timestamp, which must not appear as a historical last-activity time in this table. Future source types may be included only when their timestamps represent real events.

Requirements:

- UnifiedRecentsService remains a derived view rather than a new recorder;
- privacy controls on recent files remain unchanged;
- no new content-bearing fields are stored for dashboard purposes;
- Home only shows a bounded recent slice;
- History/Recents remains the full destination.

#### 30H.6 Local-Only Dashboard Privacy Contract

Dashboard analytics are personal workbench summaries, not product analytics.

Standing rules:

- no network request is introduced to power Home metrics;
- no telemetry SDK or remote event collection;
- no user identity;
- no pasted/input/output payload retention in usage metrics;
- no filenames added beyond what an existing feature is already allowed to retain;
- no content hashes for analytics;
- no command text/log payload collection for analytics;
- no secret/token capture in usage metrics.

Persist only the smallest metadata needed for local summaries. Extend the existing Phase 24 privacy audit to mechanically verify the daily bucket schema and tracking start.

User-authored text and links in Home panels are intentionally persisted local content, separate from usage metrics. Explain that storage behavior in the editor, include panel content in the existing Clear All and backup export/import flows, and do not send it to a service. Opening an external link is an explicit user action that may contact its destination.

<a id="exit-criteria-8"></a>

#### Exit criteria

- [x] Default Home offers a useful local usage trend, category ranking, and at least one dense table/list — a deferred compact `app-insights-section` (summary strip, 7-day bar trend, category ranking with a Lifetime / 7-day toggle, Top Tools and Recent Activity tables on `app-data-table`).
- [x] UsageService stores bounded 30-day daily-open buckets and tracking start without a second recorder; incomplete periods are labeled — `UsageStore` v2 (`dailyBuckets` + `trackingStartedOn`), migrated in place from v1 with no backfill; the trend total, unique-tools count and category 7-day view all use the same tracked days and say "partial period, tracked since …" until 7 full days have elapsed.
- [x] Home Recent Activity displays only events with real timestamps; open workspace tabs are not shown as new activity — fed by `UnifiedRecentsService.activityEntries`, which excludes `workspace-tab` before the 50-entry cap.
- [x] No second analytics/usage recorder exists solely for the dashboard.
- [x] No user payload/content is recorded to produce dashboard charts — the Phase 24 privacy audit now checks the bucket key allow-list and value shapes (dates, integer counts, registry tool ids, ≤ 30 buckets) and that panel text never reaches the usage store.

Shipped as Milestones 558–561. Decisions and additions beyond the bullet list above:

- **Buckets carry per-tool counts** (`{date, opens, perTool}`, tool ids and integers only) so unique tools and a time-bounded category view are derivable from a complete source; pruned to a rolling 30 local days on every write; usage stays out of the backup bundle.
- **Local calendar days** come from `core/usage/local-day.ts` (DST-safe calendar arithmetic); the earlier UTC `bucketOpensByDay` was removed.
- **`/insights`** is shell exception #10 (route, sidebar link, palette "Go to" entry); Home renders the same `InsightsSection` in compact mode (5-row slices), `/insights` in full (15 top tools, 50 recent rows). New `BarChart` primitive (focusable per-day text cells + hover/focus detail, no tooltip or animation) backs the trend.
- **Notes & links panel** (`core/home-panel/`, the minimal user-authored content 30H.6 refers to; the full Home layout builder remains 30I): one plain-text note (≤ 2,000 chars) and ≤ 10 http/https links, stored under `'__home__'`, included in Clear All and in the backup bundle (`homePanel` section with skip/replace/keep-both semantics and re-sanitization on parse and apply). The editor states the storage behavior. Desktop DUDE denies in-app window opens, so saved links open through a narrow `dude:external:open` IPC bridge (Milestone 562: main re-validates http(s)-only URLs and the sender, then `shell.openExternal`); on the web they are ordinary `noopener` anchors.
- The initial-bundle error budget was raised from 1 MB to 1.1 MB up front as a precaution; the deferred section kept the initial total at ~998 kB, so the extra headroom was not needed.

<a id="phase-30i"></a>

### Phase 30I — User-Designed Home

#### 30I.1 User-Designed Home Layout

Provide a Home Layout editor in Settings, with an Edit Home entry point on Home. Users can compose the Home canvas from first-party panels and user-authored text, link, and shortcut panels. The editor supports add, hide/show, drag, resize, reorder, and duplicate where a panel kind can safely have multiple instances, plus editing user-authored panel content and Reset to Default. Preserve a useful shipped default for new installations.

Use a snapping responsive grid, not pixel-precise absolute positioning. Store separate wide-desktop and narrow placements so users can deliberately arrange both, while panel instances and user-authored content remain shared. Switching widths must select the corresponding placement without losing either. Every panel has a stable instance id and panel-kind id; layout persistence is versioned and can recover from removed or renamed panel kinds without blanking Home. A layout may reference registry tools, commands, projects, workspaces, or pipelines by their authoritative ids; it must not copy their state into dashboard records.

Built-in panel kinds cover the Home surfaces in this phase: Smart Entry, Favorites, Recent Tools, resume-work panels, Quick Run, local insights, recent activity, category preview, and applicable native actions. User-authored text/link panels display locally stored user content as plain text, not executable markup. Accept only safe link schemes such as HTTPS and HTTP; reject script/data URLs. Shortcut panels point to existing tool routes, shell destinations, or CommandSource actions and use their existing navigation, execution, and confirmation paths. External links open only after an explicit user action. No panel may trigger a pipeline, native operation, or other consequential action simply by mounting or restoring a layout.

**Built-in panel kinds must be declarative.** Give each kind a colocated manifest and a typed metadata contract analogous to tool manifests. Generate the first-party panel registry from those declarations rather than maintaining a central hand-edited kind list. That registry is the single source for the Home renderer, layout editor, available-panel picker, default layout, and layout validation. At minimum, a declaration identifies a stable panel-kind id, display metadata, renderer or lazy loader, supported platform/capabilities, size constraints and default placement, whether multiple instances are allowed, supported configuration and authoritative data dependencies. Availability and empty-state behavior belong to the panel declaration or its implementation, not to a Home switch on panel ids. Persisted layouts refer to stable kind ids and instance ids; registry/version migrations handle removed or renamed kinds.

A later feature may contribute a panel through its own declaration without adding a case to Home, Settings, or unrelated shell components. For example, Git status, running processes, active containers, certificate expiry, and local servers should use the same registration path if introduced in later phases. Registering a tool alone does not automatically create a Home panel; its panel contribution is explicit. Generic Home code composes registered panel kinds and never maintains a parallel list of feature-specific ids.

The editor must work without drag-and-drop: a keyboard-accessible list/form mode allows users to add, move, resize, hide, edit, and remove panels. Focus order follows a predictable reading order in both layouts. Drag/resize handles expose their purpose and do not require hover. Prevent overlaps and unusably small panels; show an intelligible placement result before saving. Reset to Default must be available without deleting the user's underlying favorites, usage, projects, workspaces, or pipelines.

Desktop-only panels are omitted or replaced with a compact capability explanation on the web without leaving blank grid cells. User-authored panel content and layout preferences stay local under existing persistence controls. Arbitrary HTML/JavaScript execution, third-party widget code, and custom data-source scripting are outside this phase.

#### 30I.2 No Duplicate State Systems

The Phase 30 work composes existing product state and adds a user-configurable presentation layer.

Existing authoritative sources remain authoritative:

- Tool registry for tool metadata/category/routes/capabilities;
- UsageService for frequency/recent tool usage and bounded daily buckets;
- FavoritesService for tool/pipeline favorite state;
- UnifiedRecentsService for merged recent activity;
- PipelineStoreService for pipelines/pins;
- WorkspaceTemplateService / WorkspaceLayoutService for workspace state;
- Project services for project state;
- CommandSource providers for Command Palette contents;
- existing Smart Paste/file-drop detectors for classification/routing.

A versioned Home Layout store may persist panel instances, positions, sizes, visibility, and user-authored text/link/shortcut panel content. It is presentation state, not another usage recorder, project/workspace/pipeline store, or hard-coded tool inventory. Built-in panels resolve live data from the sources above.

#### 30I.3 Browse and Home State Persistence

The following preferences may persist locally:

- Browse view and sort modes;
- optional sidebar category-collapse state;
- versioned wide-desktop and narrow Home layouts;
- panel positions, sizes, visibility, and supported instance configuration;
- user-authored text, link, and shortcut panel content.

Store only references to authoritative tool, command, project, workspace, and pipeline ids in layout records. Validate restored layouts and recover safely from missing panel kinds or targets. Offer Reset to Default for layout state without erasing underlying user data.

Do not persist arbitrary search text by default when it could contain sensitive values. Search/filter state may remain route/session state instead.

#### 30I.4 Responsive Workbench Grid

Implement the Home canvas as a dense snapping grid with user-controlled placement and size.

Recommended wide-desktop behavior:

- 12-column conceptual grid or equivalent CSS Grid;
- small consistent gaps;
- panels snap to valid grid cells and do not overlap;
- minimum dimensions keep their controls usable;
- charts remain compact;
- layout changes do not cause unpredictable reading or focus order.

Store a separate narrow layout. When no user-edited narrow layout exists, derive a sensible initial arrangement from the current wide layout, or from the shipped default when the wide layout is untouched. Preserve the same panel instances and content. Switching widths or platforms must not destroy user placements. Unsupported desktop-only panels collapse without blank holes on the web. All editor functions have keyboard/list-form equivalents.

<a id="exit-criteria-9"></a>

#### Exit criteria

- [x] A user can design Home in Settings from first-party and text/link/shortcut panels, using drag/resize/reorder/hide/duplicate and a keyboard/list-form editor.
- [x] Built-in panel kinds declare typed metadata in colocated manifests; Home and Settings consume the assembled registry, and a new kind can be added without feature-specific shell branching.
- [x] Wide-desktop and narrow placements persist independently around shared panel content, restore safely, and support Reset to Default.
- [x] Restoring a layout or shortcut panel never executes its target; existing action confirmations remain in force.
- [x] Custom layouts avoid horizontal overflow, unreachable controls, and blank holes from unavailable panels without enforcing the default order.
- [x] Existing Favorites, Usage, Recents, Project, Workspace, Pipeline, and CommandSource systems remain authoritative.
- [x] Dashboard metrics and user-authored panel content remain local; panel content participates in Clear All and backup export/import.

#### Shipped (Milestones 563–571)

- **M563 grid engine** (`core/home-layout/grid-engine.ts`): a pure 12-column snapping engine — clamp/snap, collisions, `tryPlace` (refuses overlaps, too-small/too-large sizes and out-of-bounds with a readable message rather than silently moving anything), `firstFit`, `normalizeLayout` (repairs without dropping), `deriveNarrow`, `moveInReadingOrder`/`repackInOrder`, `compactUp` (closes the gaps left by omitted panels). It is the single source of truth for validity; pointer UIs only propose.
- **M564 panel manifests**: `shared/models/panel-definition.model.ts` (id, display metadata, lazy `load`, size limits, default placement, `multiInstance`, typed `config` schema, `capabilities`/`desktopOnly` + `webBehavior: 'omit' | 'explain'`, `showWhen`, `deferUntilVisible`, `dataDependencies` from a closed authoritative-source vocabulary, `userContent`, `replaces`). Feature-owned `<kind-id>.panel-manifest.ts` files are assembled by `scripts/generate-panel-registry.mjs` into `core/registry/panel-definitions.ts` (part of `npm run generate:registry`, and of the CI staleness check); the `.panel-manifest.ts` suffix is deliberately distinct from `.manifest.ts` so a panel is never mistaken for a tool. `PanelRegistryService` and `validatePanelDefinitions` (asserted over the real registry by `home-layout-framework.spec.ts`) serve the renderer, the editor, the picker, the default layout and validation.
- **M565 layout store** (`core/home-layout/`, `'__home-layout__'` namespace, so Clear All covers it): versioned, sanitizing, and presentation-only — instances (id + kind id + validated config), separate wide/narrow placements, visibility, and user-authored content. Untouched installs store nothing and render the manifest default (so newly shipped kinds appear for them); once a layout is saved, later kinds appear only in the picker. Unknown kinds are kept as dormant instances, renamed kinds map through `replaces`, and corrupt data degrades to the default. Backup: the additive optional `homeLayout` bundle section (bundle schema version unchanged; older `homePanel` bundles still import) is re-sanitized against the registry on parse and apply.
- **M566 Home renderer**: `Deck` is page chrome around `HomeCanvas`, which names no panel kind — it measures its own container width (narrow below 720 px), lays cells out on a CSS grid in reading order, drops hidden/dormant/desktop-only-on-web/currently-empty (`showWhen`) panels and compacts upward so no blank holes remain. Every former Home surface is now a kind: Search & Jump, Smart Entry, install prompt, Open File, Recently Used, Favorites, Resume Work, Quick Run, Insights summary, Activity trend, Category usage, Top tools, Recent activity, Clipboard Actions, Native Capabilities, Browse Tools strip, and Category preview. Each panel resolves live data from its authoritative service; none is a copy.
- **M567 user panels**: text (plain text, never markup), link (http/https only, no credentials; desktop opens via the external-link bridge on click), and shortcut panels (tool / app page / Settings section / `CommandSource` command references resolved by `ShortcutResolverService`; only a click runs anything, through the target's own confirmation path; a missing target becomes a disabled chip). The M561 Notes & links content migrates once into the default text and link panels and the `'__home__'` store is emptied.
- **M568 Settings › Home layout** (shell exception #11): a keyboard-first list/form editor over a draft — add from the registry picker, show/hide, move earlier/later, position and size by number, duplicate (multi-instance kinds), per-panel config and content editing, remove, separate Wide/Narrow tabs (narrow follows wide until deliberately arranged), an at-a-glance preview, Save/Discard through the existing unsaved-changes guard, and a two-step Reset to Default that touches layout state only. All operations are pure functions (`draft-ops.ts`) shared with the visual editor.
- **M569 visual editor**: `gridstack` (exact-pinned 14.0.0, MIT) behind a thin `GridAdapter` seam, loaded on demand and only in the editor — never in the Home bundle. It runs in `float` mode with a fixed 12 columns and only proposes placements; every drag, resize or arrow-key (Shift+arrow resizes) proposal is validated through `placePanel`, and a refusal snaps the surface back and explains why in the live status. Resize corners are always visible, not hover-only.
- **M570 persistence**: Browse sort mode now persists (URL still overrides; validated on read) and the sidebar remembers which categories the user keeps open (`'__sidebar__'`). **This deliberately reverses 30B's "session-only" collapse decision, narrowly:** only *keep open* persists — the default stays collapsed and the active route's category still auto-expands, so a Ctrl+K jump never lands with the tool hidden. Search text and filters remain route/session state and are never stored. "Edit Home" on Home links to the editor.
- **Verification status**: unit and integration coverage is complete (engine, manifests, store/migration/backup round trip, renderer omit-and-compact, shortcut resolver never executing on mount, editor operations, the real gridstack library smoke-tested in jsdom); lint, `npm test`, `test:high-consequence` and `test:electron` pass. **A live Chrome pass against `ng serve` confirmed**: Home renders from the manifests with no overflow; the editor opens with 19 panels and gridstack draws always-visible resize corners; a real pointer drag that would overlap Quick Run was refused ("Overlaps 1 other panel.", panel snapped back, not dirty); Shift+Arrow resized a panel and Save persisted it across a reload; constraining the canvas to 600 px switched it to the narrow layout (all panels full width, no overflow) and back to wide; Reset to Default restored the default without touching favorites or usage; no console errors. A second live pass (dev server, then the production build served like GitHub Pages) additionally confirmed: successful gridstack pointer resize (6→4 cells) and pointer move into freed space, both persisting to Home; add/duplicate/hide/remove, shortcut-target picking and a shortcut chip that navigates only on click; independent narrow editing that leaves wide alone; text panels staying inert (`<img onerror>` never becomes an element), `javascript:` links rejected in the panel, saved links rendered with `noopener`; and the production build's direct `/DUDE/settings/home-layout` route (with the lazy gridstack chunk) and Home rendering with no console errors or overflow. That pass found and fixed: oversized default cells leaving blank gaps (Smart Entry and the Browse strip now default to one row, since rows grow to content), the shortcut picker listing description matches ahead of title matches, and a just-saved layout still counting as "unsaved" (placement order differed after the store re-sorted it — now compared by an order-independent `draftSignature`). **Still owed** (not required by any exit criterion): a screen-reader pass and the desktop (Electron) external-link click, which cannot be exercised in a browser. The initial bundle measured ~1.01 MB against the 1.1 MB error budget (it was ~998 kB before this phase).
- **Not shipped / follow-ups**: no third-party widget code, custom data-source scripting, or arbitrary HTML (out of scope by design). The gridstack stylesheet is 6 kB and trips the 4 kB `anyComponentStyle` *warning* (error at 8 kB); it lives only in the lazy editor chunk.

*Status (Milestones 563–571): all seven criteria are met and were verified by unit/integration tests plus two live browser passes (dev server and the production build). Two checks that no criterion depends on remain open: a screen-reader pass over the editors, and the desktop (Electron) external-link click, which only unit tests cover.*

<a id="phase-30j"></a>

### Phase 30J — Density, Color, and Spacing

#### 30J.1 Functional Use of Category Color

Retain DUDE's bold category palette but use it more precisely.

Large category-colored/tinted panel surfaces should be replaced where practical by smaller functional accents such as:

- 2–3px edge/top rule;
- category icon;
- label;
- count;
- badge;
- focus/selection treatment;
- chart bar/series;
- active filter indicator.

Neutral dark surfaces should carry most dashboard area.

This does **not** mute DUDE's palette.

The purpose is to increase information density and visual hierarchy by concentrating color where it communicates category/state rather than filling hundreds of square pixels with a category tint.

Semantic colors for:

- error;
- warning;
- success;
- info;
- busy;
- offline

remain distinct from category colors.

#### 30J.2 Compact Density Baseline

Phase 30J may refine the default shell dimensions to better fulfill the existing "extremely dense" contract.

Target ranges, not rigid pixel requirements:

- base shell text: approximately 12–13px;
- secondary metadata: approximately 11–12px;
- compact controls: approximately 28–32px high;
- table/tool rows: approximately 28–32px;
- panel padding: approximately 8–12px;
- normal panel/grid gap: approximately 8px;
- major section separation: approximately 12–16px;
- small border radius: approximately 3–5px.

These are baseline implementation targets, not user-configurable presets.

Phase 30K delivered the user-selectable Density Presets (M582) and the font/theme customization, keeping this baseline as the default Compact preset.

#### 30J.3 Spacing Token Audit

Normalize shell/dashboard spacing around a compact token scale instead of page-local arbitrary values.

Recommended conceptual scale:

```text
4px   micro
8px   normal
12px  panel/section
16px  major
24px  exceptional
```

The exact token names may follow the existing design-token system.

Phase 30J should remove obvious oversized gaps in:

- Home;
- sidebar;
- Browse Tools;
- dashboard panels;
- search/filter bars.

Do not globally compress tool workspaces without verifying their individual usability.

#### 30J.4 Progressive Disclosure

Dense does not mean "everything visible at once."

Use progressive disclosure for:

- Smart Paste expansion;
- advanced Browse filters;
- secondary metadata;
- capability explanations;
- full category contents;
- longer descriptions;
- usage details;
- full recent activity.

Primary actions stay visible.

Secondary explanation appears on demand.

<a id="exit-criteria-10"></a>

#### Exit criteria

- [x] Category color is primarily structural/semantic rather than large-area decoration. Resting panels, tool cards and rail/related chips are neutral `bg-panel` with a 2px category rule; the category wash is hover-only.
- [x] Workbench shell changes do not prematurely couple to theming/density customization; the dedicated appearance work remains separately defined for Phase 30K. Density is a fixed baseline in `tokens.css`/`styles.css`; no user-facing setting or persisted appearance state was added. *(True as of 30J. Phase 30K later moved these values into `theme-tokens.json` and added the user-facing appearance settings, with this baseline kept as the default Compact density.)*

#### Shipped (Milestones 572–575)

- **M572 — Density baseline.** Retired the 13px x 1.5 UI scale (a 19.5px root, which is what made the shell read as loose). Root is now 16px, so Tailwind spacing is the PRD scale (`p-1`=4 ... `p-6`=24) and `text-xs` is 12px. `text-ui`/`-sm`/`-xs` re-based to 13/12/11px. Added `--dude-space-*`, `--dude-control-h` (28px), `--dude-row-h`, `--dude-radius` tokens. `scripts/check-design-tokens.mjs` flags off-scale spacing, arbitrary sizes, radii above 5px, raw hex and resting category wash in `shell/` and `shared/`; it runs with `--enforce` inside `npm run lint` (`npm run check:design`).
- **M573 — Color.** Semantic colors re-picked (`error #ff4d4d`, `warning #d99a00`, `success #46e05a`, `info #1a79ff`, `busy #c233ff`, `offline #717f94`). Rule: each is >=22deg hue or >=12 HSL-lightness points from every category and the accent, and >=4.5:1 on `--color-panel` (checked at the time by `scripts/check-semantic-palette.mjs`, also in `check:design`; Phase 30K's M577 replaced it with `scripts/check-theme-contrast.mjs`, which keeps this separation rule and checks it across every appearance combination). The 30-degree/15-point version was not satisfiable for info/busy: eight categories plus six semantic colors do not fit on one hue wheel. Category hexes are unchanged. (Phase 30K's M578 later moved the default dark info, busy, error and offline values and the web and security category colors; see [Color System](../product/UX_SPEC.md#color-system).)
- **M574 — Spacing + primitives.** `dude-input`, `dude-chip`, `dude-chip-on/off` utilities replace the class strings that were copy-pasted across shell templates. All off-scale values in Onboarding, Settings, sidebar and shared components fixed.
- **M575 — Progressive disclosure.** New `shared/components/disclosure` (`aria-expanded`/`aria-controls`, badge, collapsed summary, state not persisted). Browse category/status/sort selects and catalog counts sit behind "Filters" with an active-filter badge; Smart Paste, Insights and the desktop-only panel card explanations collapse to a one-line summary.

*Status (Milestones 572–575):* verified in the dev server on Home, Browse (table, grid, filtered), a tool workspace, Insights and the command palette; unit tests, lint and `ng build` pass. The items then still owed were closed later. The production-build direct-route check and a per-category tool-workspace sample are covered by the main e2e suite and Phase 30K's appearance matrix, which opens one tool per category on every combination. Settings › Appearance and Onboarding are covered by that matrix and the owner's Phase 30L visual pass. Category-preview contents, full Recent Activity and long descriptions use bounded slices with a "View all" route (Browse Tools, `/insights`, `/history`), and truncated tool-grid descriptions carry their full text as a title (M591). Platform chips, Favorites and Recent stay visible in Browse because the web-companion e2e depends on them.

<a id="phase-30k"></a>

### Phase 30K — Theming, Appearance, and Accessibility Expansion (✅ Complete — shipped as Milestones 577–585)

#### 30K.1 Theming, Appearance & Accessibility Expansion

Evolve the previously fixed dark-only visual implementation into a controlled theming system without losing DUDE's dense workstation identity or allowing per-tool visual drift.

1. **Light Mode** — a second, fully contrast-checked first-party theme
2. **Theme Customization** — controlled user customization on top of shared design tokens
3. **Accent Palette Selection**
4. **Density Presets**
5. **Font Preferences**
6. **Editor/Data Font Selection**
7. **Reduced Motion Support**
8. **High-Contrast Mode**
9. **Better color-blind-safe semantic alternatives**
10. **User theme export/import**

<a id="notes-21"></a>

##### Notes

This phase intentionally changed the design contract described in [Appearance System](../product/UX_SPEC.md#appearance-system): before it, DUDE shipped one dark, highly colorful theme. Dark is now the default of a controlled set of first-party appearance axes, and Milestone 586 applied that change to [Appearance System](../product/UX_SPEC.md#appearance-system), [Tool categories](../architecture/SYSTEM_ARCHITECTURE.md#tool-categories), [Accessibility](../product/UX_SPEC.md#accessibility), [Interview Questions and Answers](DECISION_LOG.md#interview-questions-and-answers) Q12, the root and nested `AGENTS.md` files, `README.md`, `ADDING_A_TOOL.md`, and `package.json`'s description (the token files' own comments were already current from M577).

Customization must remain token/system driven. Individual tools should not invent private palettes/themes that fragment category, status, focus, error, or accessibility semantics.

Customization means composing first-party, pre-validated options per axis. Free color pickers, a user token editor, arbitrary user themes, per-tool themes, and bundled web fonts remain out of scope.

**Goal:** move appearance from a fixed implementation choice into a controlled platform capability without sacrificing the dense workstation identity.

<a id="exit-criteria-11"></a>

#### Exit criteria

- [x] Light Mode ships as a second, fully contrast-checked first-party theme — a "bright workstation" light base with its own category palette (M578), inside the contrast lint matrix and `npm run test:appearance`.
- [x] Theme customization is controlled and driven by shared design tokens rather than private per-tool palettes — every value comes from `theme-tokens.json` through generated CSS (M577); `check-design-tokens.mjs` rejects raw palette colors, `text-bg` and template hex in tools.
- [x] Accent Palette Selection is available without fragmenting category, status, focus, error, or accessibility semantics — six accents (M579), each checked for semantic separation and on-accent contrast.
- [x] User-selectable Density Presets are implemented while preserving DUDE's dense workstation identity — Compact (default, the unchanged 30J baseline), Comfortable, Ultra-compact (M582).
- [x] Font Preferences and Editor/Data Font Selection are supported through the shared theming system — curated installed-font stacks and a sanitized custom name for UI and data/code text, independent size steps, ligatures On/Off (M582).
- [x] Reduced Motion Support is implemented — System (default) / Reduce / Allow (M583).
- [x] High-Contrast Mode is implemented — Standard / High / System over both themes, plus a forced-colors pass (M580, M585).
- [x] Better color-blind-safe semantic alternatives are implemented — a blue/orange status set and a Color-blind-safe category set, plus always-on non-color status cues (M579, M581).
- [x] User theme export/import is implemented — `*.dude-theme.json` and the optional backup-bundle `appearance` section (M584).
- [x] [Appearance System](../product/UX_SPEC.md#appearance-system), shared design tokens, `AGENTS.md`, contrast/accessibility guidance, and any other living specification that assumed one fixed dark theme are updated consistently — Milestone 586.

#### Shipped (Milestones 577–585)

- **M577 — Token architecture.** `src/styles/theme/theme-tokens.json` is the single machine-readable token source. `scripts/generate-theme-css.mjs` generates `src/styles/theme.generated.css` (plain `:root` and `:root[data-*]` custom properties; each default is expressed through `:not(...)`, so an absent or unknown attribute value falls back) and `core/appearance/appearance-axes.generated.ts`. `src/styles/tokens.css`'s `@theme` now only maps Tailwind names to `var(--dude-*)`, which fixes Tailwind freezing the category wash/tint to literal hexes and dropping unused density tokens. `--color-on-accent` replaced `text-bg` on fills (239 uses codemodded). `core/appearance/`: the pure model (`sanitizeAppearance` never throws; custom font names pass a CSS-injection guard) and `AppearanceService` (`local` storage, `crossTab: 'live'`, one `data-*` attribute per axis on `<html>`, a `revision` signal the charts re-read colors on). An inline pre-paint script in `src/index.html` applies the attributes before first paint. `scripts/check-theme-contrast.mjs` replaced `scripts/check-semantic-palette.mjs`: a WCAG matrix over every base × contrast × accent × category set × status set (144 combinations and 49,008 checks today), run with `generate-theme-css.mjs --check` in `npm run lint`. The default appearance was unchanged by this milestone.
- **M578 — Light Mode.** A "bright workstation" light base with its own category palette (new hues, not darkened dark ones) and light status colors; Settings › Appearance (Dark / Light / System, default Dark). The media-scoped light/dark `theme-color` metas are replaced at runtime by one meta carrying the resolved background. The web manifest keeps the dark `theme_color`/`background_color`, because the manifest has no per-color-scheme member (known limitation). The Markdown preview iframe follows the theme; HTML Preview, SVG Viewer and the image tools share a preview-background picker (Theme / White / Dark / Checker), and user-document iframes no longer inherit the app's color scheme. `check-design-tokens.mjs` now scans `src/app/tools` for color rules (raw Tailwind palette utilities, `text-bg`, text-color opacity, hex in `.html`/`.css`; hex in `.ts` stays allowed as tool data). The stricter lint changed the default dark palette (recorded in [Color System](../product/UX_SPEC.md#color-system)): category web `#60a5fa` → `#81b9fe` and security `#e879f9` → `#f97bf7` (the owner's choice over pastel status colors), status info `#1a79ff` → `#4294ff`, busy `#c233ff` → `#c966ff`, error `#ff4d4d` → `#ff5757`, offline `#717f94` → `#8c97a8`; Advanced Diff's inline highlights use normal text color and 19 faded-text styles were removed. `npm run test:appearance` (`e2e/appearance/`) started here.
- **M579 — Accents and category sets.** Six accents (Cyan default, Blue, Violet, Green, Amber, Magenta), each with dark/light values and a paired on-accent; three category palette sets (Vivid default, Soft, Color-blind safe — pairwise distinguishable under simulated protanopia, deuteranopia and tritanopia in both themes).
- **M580 — High Contrast.** Standard / High / System (`prefers-contrast: more`) as a modifier over both bases: text ≥ 7:1, borders ≥ 3:1, a thicker (3px) focus ring. A `forced-colors` pass covers focus, selection, disabled state, chips, and the canvas-chart fallback.
- **M581 — Color-blind-safe status colors.** An opt-in blue/orange status set (success is blue), plus always-on non-color cues in every theme: a shared status glyph on status surfaces and +/− markers in the diff views. Info banners use normal text with a colored ⓘ glyph.
- **M582 — Density and fonts.** Compact (default, the unchanged 30J baseline) / Comfortable / Ultra-compact through `--spacing` plus control, row, radius and UI-text tokens; UI and data/code text size steps (Small / Default / Large), the data step applied to monospace subtrees without compounding; code ligatures On/Off; curated installed-font stacks for UI and monospace plus a sanitized custom installed-font name. No bundled web fonts.
- **M583 — Reduced Motion.** System (default, honoring `prefers-reduced-motion`) / Reduce / Allow. Under Reduce, app animation and transitions are removed globally outside `[data-motion-exempt]`, and skeleton pulses become static. User-authored motion previews (CSS Animation Builder, Cubic-Bezier Editor, through the shared CSS preview sandbox's `motion` input) are exempt but start paused with a Play control.
- **M584 — Export/import, Onboarding, desktop sync.** A standalone `*.dude-theme.json` file (`{format: 'dude-theme', schemaVersion: 1}`, 16 KB cap, preview then apply, dropped/unknown fields reported) from Settings › Appearance. An optional additive `appearance` section in the DUDE backup bundle (bundle schema version unchanged; re-sanitized on parse and on apply), the only record exported from the `settings` namespace. Onboarding gained an Appearance page (theme, density, contrast), and its steps are now page ids. On desktop, the `dude:appearance:set` bridge syncs `nativeTheme.themeSource` and the window background, persisted so the next launch creates the window with the right background.
- **M585 — Exhaustive matrix.** `npm run test:appearance` against the production build: 864 color/state combinations (theme 2 × contrast 2 × accent 6 × category set 3 × status set 2 × density 3 × motion 2) on Home, the Ctrl+K palette, Browse Tools, Settings › Appearance and one tool per combination (rotating through one tool per category), plus a 108-combination layout sub-matrix (theme × contrast × density × UI text size × data text size) × 3 viewports (1920×1080, 1440×900, 1366×768) — 1,188 tests, all passing, 7.8 min on 18 workers. Fixes: high contrast clamps accent washes (`bg-accent/15`, `/20`, including hover) to 10% so accent text keeps ≥ 7:1, after which the high-contrast slice (594 tests) re-ran green; the 6 stale main-e2e specs (Home deck search/facets gone since 30D, `app-tool-table` gone since M552) were retargeted to Browse Tools, and the main e2e suite passes 68/68.

**Scope decisions (locked by the owner):** the axes are independent. The only entry points are Settings › Appearance and the Onboarding Appearance page (no palette commands, no sidebar toggle). Appearance is global (`local`, live across tabs), not per workspace or project. Phase 30L keeps its own later gate in addition to 30K's matrix.

*Status (Milestones 577–585; recorded in the PRD by Milestone 586):* all ten exit criteria are met; `npm run lint` (including the contrast matrix), `npm run test:appearance` and the main e2e suite pass. **Still owed** (not required by any exit criterion): a manual Electron check of the packaged app in dark, light and system while toggling the OS theme (window background, native menus and scrollbars, no white flash); a manual Windows Contrast Themes (forced-colors) check, since the forced-colors pass was verified by code review only; an eyeball check of light + high contrast + color-blind-safe `info` (`#4e4e74`), which sits close to `offline`. Curated fonts are applied before first paint since Milestone 587 (`data-ui-font`/`data-mono-font`); only a custom installed-font name is still applied at bootstrap. The initial bundle totals ~1.04 MB: over its 500 kB warning budget by ~539 kB (an earlier revision of this line misquoted that overage as the bundle size) and ~60 kB under the 1.1 MB error budget.

<a id="phase-30l"></a>

### Phase 30L — Integrated Scale, Accessibility, and Platform Verification (✅ Complete — shipped as Milestones 587–592)

Run this integrated gate after Phase 30K (shipped). Verify the completed shell with representative combinations of supported themes, density and font settings, high contrast, and reduced motion, in addition to the default appearance. Phase 30K's own matrix, `npm run test:appearance`, already sweeps every appearance color combination for pre-paint, overflow, focus, contrast and motion; this gate builds on it rather than replacing it, and adds the scale, keyboard, first-frame and platform checks below. Both gates stay.

#### 30L.1 Performance & Rendering Budget

The redesigned shell must not undo the startup/chunk work from earlier phases.

Requirements:

- Home must not eagerly load all tool components;
- displaying registry metadata must not load tool implementation chunks;
- dashboard charts must not justify a large initial bundle regression;
- Browse Tools renders metadata, not tool components;
- expensive sorting/filtering should remain responsive across current and future registry size;
- use list/table virtualization when it materially helps;
- avoid rerendering every tool row for unrelated dashboard state changes;
- charts should consume already-derived local aggregates rather than repeatedly scanning large history stores on every change-detection pass.

A registry containing substantially more tools than today should remain usable without architectural changes to Home.

#### 30L.2 Web Companion Behavior

The Web companion receives the same default information architecture and Home Layout editor where the underlying data is available.

Web Home should support:

- compact Smart Paste;
- Favorites/Recents;
- Pinned Pipelines where supported;
- Quick Run;
- local activity summaries;
- Browse Tools;
- category navigation.

Desktop-only sections such as native file/project actions may be:

- omitted;
- replaced with the existing capability/handoff explanation;
- represented by a compact disabled/unavailable state where that improves discoverability.

Do not leave blank dashboard columns merely because a desktop-only block is unavailable.

#### 30L.3 Desktop Home Behavior

Desktop remains canonical and should make native context especially useful.

The desktop Home may prioritize:

- recent projects;
- recent workspaces;
- recent explicit files;
- native Open File/Open Folder actions;
- native clipboard actions;
- pinned pipelines;
- native-capability entry points.

These remain views over existing command/project/recent infrastructure, not new hand-coded action registries.

#### 30L.4 First-Frame Quality Gate

Test the shipped default Home at normal scale rather than only after zooming out.

Required visual/manual checks:

- 1920x1080 at 100%;
- 1440x900 at 100%;
- 1366x768 at 100%;
- Windows display scaling representative of supported desktop use;
- corresponding desktop-Chromium web-companion checks.

The default passes the specific first-viewport targets in requirement 30D.2. Both default and representative user-edited wide/narrow layouts must have no horizontal overflow, clipped or unreachable controls, hover-only critical actions, lost focus indicators, or blank holes from unavailable panels. The sidebar stays bounded and the complete catalog stays easy to reach. User layouts are not tested against the default panel order or above-the-fold composition.

#### 30L.5 Home/Tool-Browser Keyboard Acceptance

Automated or integration coverage should verify at minimum:

1. Home loads and Smart Entry receives focus when explicitly requested.
2. Ctrl+K still opens Command Palette, including from a custom layout.
3. Favorite and recent tools can be opened without a pointer.
4. Browse Tools can be reached without a pointer.
5. Search can filter a known registry tool.
6. Category selection correctly filters results.
7. Arrow/Enter navigation works for the chosen result pattern.
8. Favorite toggle is keyboard accessible.
9. Escape returns from transient filter/overlay state predictably.
10. The Home Layout editor can add, move, resize, hide, edit, and remove a panel through its keyboard/list-form path.
11. A shortcut panel uses the same confirmation boundary as its target action; mounting/restoring a layout never executes it.

#### 30L.6 Registry Scale Fixture

Add a development/test fixture capable of generating a much larger synthetic manifest set than the current registry.

The fixture should verify that shell/discovery architecture does not assume today's tool count is a ceiling.

Test at minimum:

- 500 tools;
- 1,000 tools where practical.

This fixture tests:

- search/filter speed;
- result rendering;
- category counting;
- deterministic sort;
- Home boundedness;
- sidebar boundedness.

Synthetic manifests are for testing only and never ship as fake tools.

#### 30L.7 Visual Regression / Structural Assertions

Even if exhaustive visual-regression infrastructure remains out of scope, add targeted structural checks for the new shell contract.

Examples:

- default Home does not render one link for every registered tool in every category;
- category previews enforce a maximum item count;
- sidebar category navigation remains bounded as registry size grows;
- full registry is available from Browse Tools;
- built-in Home panels use existing stores rather than copied fixture lists;
- desktop-only panels do not leave empty web-companion holes;
- chart empty states do not fabricate data;
- user layout restoration handles a removed panel kind/target without blanking Home;
- a fixture panel kind can be registered, offered in the editor, rendered, and restored without changing Home or Settings branching;
- wide and narrow layouts remain independent;
- panel placement cannot overlap or make controls unreachable;
- editing or restoring a shortcut panel does not execute its target.

#### 30L.8 Shared Design Documentation

Document the new shell rules near the implementation.

The documentation should explain:

- Home vs Browse Tools responsibility;
- default Home composition and the user layout editor;
- built-in and user-authored panel-kind contracts;
- wide/narrow layout persistence, versioning, recovery, and Reset to Default;
- dashboard panel conventions;
- density targets;
- category-color usage;
- chart and table rules;
- state-source ownership and privacy rules;
- keyboard/list-form editing conventions;
- how a future feature becomes eligible as a Home panel without hard-coding a tool id into unrelated shell components.

Document the panel manifest fields, registry assembly, ownership of panel data/availability, and the steps for adding a panel kind. This is an architecture contract for built-in panels, not only authoring guidance.

Future tools should continue to require only registry/manifest registration; adding a tool must not require editing Home.

#### 30L.9 PRD Navigation Contract

The living [Navigation and Information Architecture](../product/UX_SPEC.md#navigation-and-information-architecture) and 27 navigation/deck contracts now distinguish:

- **Home / Workbench Dashboard** - bounded by default, personalized, action-first, and user-configurable;
- **Browse Tools** - exhaustive registry/discovery surface;
- **Sidebar** - persistent destination/category navigation;
- **Command Palette** - universal expert launcher;
- **Dedicated routes** - stable bookmarkable tool destinations.

The original V1 all-tools-on-Deck requirement remains in those sections only as a historical acceptance record. After implementation, verify that the living contract still matches the shipped navigation and update examples or screenshots that imply the complete registry belongs on Home.

<a id="exit-criteria-12"></a>

#### Exit criteria

- [x] Home and Browse Tools do not eagerly load tool implementation chunks. `e2e/phase30l-workbench.spec.ts` records every script request on Home (default and with seeded favorites/usage) and Browse Tools (table and grid, scrolled) and fails on any tool-only chunk from `offline-map.json`; a direct tool route must request one, so the check is not vacuous. The Home Quick Run panel now resolves pipeline steps only on first user intent (M590).
- [x] Default Home remains bounded with a synthetic 500-tool registry, and with 1,000 (`src/testing/synthetic-tool-registry.ts`, `shell/registry-scale.spec.ts`, M588).
- [x] Web companion receives the same default information hierarchy with graceful omission/substitution of desktop-only blocks: no desktop-only panel and no blank holes at four widths or in a custom layout (M591).
- [x] Focus, keyboard navigation, contrast, and existing accessibility baseline remain intact for browsing and layout editing: 30L.5 items 1–11 run pointer-free in `e2e/phase30l-keyboard.spec.ts`, and the three keyboard bugs the gate found were fixed (M591).
- [x] Building on Phase 30K's `npm run test:appearance` matrix (which stays in force), representative light/dark, density, font, high-contrast, and reduced-motion settings pass the first-frame, overflow, focus, keyboard, contrast, and responsive checks above: `e2e/phase30l-first-frame.spec.ts`, 5 appearances × 5 displays, plus the owner's manual visual pass.
- [x] Phase 30C's dev-only `/dev/primitives-preview` route and `src/app/dev-preview/` are deleted now that 30D–30H's real Home panels/tables/charts exercise the shared primitives directly (M587).

#### Shipped (Milestones 587–592)

- **M587 — Dev preview removed; fonts before first paint.** Deleted the Phase 30C harness and its dev-only route. Curated UI/mono fonts are now `data-ui-font`/`data-mono-font` attributes with generated CSS rules, set by the inline pre-paint script and `AppearanceService`, which closes 30K's font-swap follow-up for curated fonts.
- **M588 — Registry scale fixture (30L.6).** A `TOOL_DEFINITION_SOURCE` token behind `ToolRegistryService` (production still reads the generated `TOOL_DEFINITIONS`). A test-only synthetic generator (never imported by app code) drives `registry-scale.spec.ts` at 500 and 1,000 tools, which checks:
  - Browse Tools exposes the full registry, with working search, category filter and counts, and deterministic sort. Its initial jsdom render takes ~160–190 ms, so list virtualization was not needed.
  - The sidebar keeps 8 collapsed category rows.
  - Category previews and the category strip stay capped.
  - Home's tool-link count is small and identical at both sizes.

  Fix: an expanded sidebar category now shows at most `SIDEBAR_CATEGORY_LIMIT` (15) tools, plus the active tool, then an "All N … tools" link into Browse Tools. Developer alone had 129 inline links.
- **M589 — Structural assertions (30L.7).** `home-structural.spec.ts` checks:
  - A test-only fixture panel kind is offered in the editor, rendered, and restored with no Home or Settings branching.
  - A removed kind, or a shortcut to a removed tool/command, never blanks Home.
  - Activity and category charts show honest empty states rather than fabricated series.
  - Favorites and Recently Used read the live stores.
  - A restored shortcut never runs, and a click goes through the target command's own confirmation path.

  The list-form editor gained move, remove + discard and number-field resize coverage. The chart option builders produce no points for empty input.
- **M590 — Two bugs found during the gate.**
  - A Home layout written by a newer DUDE build (`schemaVersion` > 1) was reset and written back on load, destroying it. It is now read best-effort and never written on load.
  - Home's Quick Run panel imported up to 8 tools' pipeline-step modules on mount. It now does so on first focus, input or paste.
- **M591 — e2e gate (30L.1, 30L.2, 30L.4, 30L.5).** Three new spec files in the main e2e suite (126 tests, all passing): `phase30l-workbench`, `phase30l-keyboard` and `phase30l-first-frame` (1920×1080, 1440×900, 1366×768, and 1366×768 at 1.25× and 1.5× display scaling). Fixes for what the gate found:
  - Smart Entry expanded on focus but removed the focused element, dropping keyboard focus to `<body>`. Focus now moves into the paste box, and Escape returns it.
  - Command-palette groups are ordered by their best match tier, so "browse" + Enter opens Browse Tools instead of a tool with a description hit.
  - Escape in Browse Tools clears query and facets from any toolbar or filter control, not only the search box.
  - `offline-readiness.spec.ts` was retargeted to the capped sidebar.
- **M592 — Documentation and PRD (30L.8, 30L.9).** `src/app/shell/deck/AGENTS.md` is the Home/Workbench shell contract. It covers:
  - Home, Browse Tools, Sidebar, Command Palette and routes.
  - Default composition and the editor.
  - Built-in and user-authored panel-kind contracts and data/availability ownership.
  - Wide/narrow persistence, versioning, recovery and reset.
  - Dashboard, density, category-color, chart and table rules.
  - State ownership and privacy.
  - Keyboard/list-form conventions.
  - How a feature becomes a Home panel.

  `shell/AGENTS.md`, `core/home-layout/AGENTS.md` and `ADDING_A_TOOL.md` point to it. [Navigation and Information Architecture](../product/UX_SPEC.md#navigation-and-information-architecture), [Command Palette Requirements](../product/UX_SPEC.md#command-palette-requirements) and [Home and Deck Requirements](../product/UX_SPEC.md#home-and-deck-requirements) now state the five-way navigation contract in shipped terms.

*Status (Milestones 587–592):* all six exit criteria are met. The full unit suite, `npm run lint`, `ng build` and the main e2e suite (126 tests) pass, and the owner ran the manual first-frame visual check. Phase 30K's own gate, `npm run test:appearance`, stays in force alongside this one.

**Known and intentional:** `main` statically includes a few small pure tool-logic modules (color, IP, JWT, UUID and similar parsers) through the Smart Paste detectors (Phase 21 Item 3, M473). The chunk gate excludes `main`'s static import closure; route-triggered tool chunks are what it forbids.

**Carried forward** (not required by any 30L criterion):

- Phase 30K's manual Electron dark/light/system check and Windows Contrast Themes (forced-colors) check.
- 30I's screen-reader pass over the editors.
- No built-in desktop-only panel yet uses `webBehavior: 'explain'`; all use `'omit'`, which 30L.2 permits.
- The initial bundle remains over its 500 kB warning budget (~1.04 MB, under the 1.1 MB error budget).

### Phase 30 overall outcome

**Goal:** complete the transition from a tool deck into a true developer workbench. DUDE Home should surface the user's likely next action and current work context; Browse Tools should handle exhaustive discovery; Ctrl+K should remain the expert fast path. The application should feel denser and show substantially more useful information at normal zoom **without** becoming a smaller-font version of the same giant scroll wall.

**Outcome (Milestones 537–592):** met. Home is bounded, personal and user-designed; Browse Tools owns exhaustive discovery; the sidebar and palette stay bounded and fast at 1,000 synthetic tools; appearance is a controlled platform capability; and Phase 30L's gate keeps all of it under automated test.

<a id="phase-31"></a>

## Phase 31 — Windows & Process Tools

**Status:** ✅ Complete — shipped as Milestones 593–614

Make DUDE genuinely useful for day-to-day Windows developer/system troubleshooting now that it has a native process and a controlled preload/IPC boundary.

The 28 items below shipped as **19 new routes** (System Changes plus 18 tools) and **two upgrades to existing tools** (`local-network`, `pe-header-viewer`), following Phase 29's "fewer, bigger" shape: viewers absorbed their diff, tree, dependency and filter items, and kill/restart are Process Viewer actions.

1. **Environment Variable Viewer** — **✅ shipped (M598)** via `environment-variables`.
2. **PATH Editor** — **✅ shipped (M599)** via `path-editor`.
3. **Registry Viewer** — **✅ shipped (M601)** via `registry-editor`.
4. **Registry Diff** — **✅ shipped (M601)** via `registry-editor`.
5. **Services Viewer** — **✅ shipped (M602)** via `services-viewer`.
6. **Process Viewer** — CPU, memory, threads, command line, environment, loaded modules, open ports, open files, parent/child relationships — **✅ shipped (M595)** via `process-viewer`.
7. **Process Tree** — **✅ shipped (M595)** via `process-viewer`.
8. **Kill Process** — **✅ shipped (M596)** via `process-viewer` actions (also from `port-process-lookup` and `file-lock-inspector`).
9. **Restart Process** — **✅ shipped (M596)** via `process-viewer` actions.
10. **Port → Process Lookup** — **✅ shipped (M597)** via `port-process-lookup`, with the `local-network` upgrade.
11. **Windows Event Log Viewer** — **✅ shipped (M603)** via `event-log-viewer`.
12. **Scheduled Tasks Viewer** — **✅ shipped (M604)** via `scheduled-tasks`.
13. **Startup Programs Viewer** — **✅ shipped (M605)** via `startup-programs`.
14. **Installed Software Viewer** — **✅ shipped (M606)** via `installed-software`.
15. **Windows Feature Viewer** — **✅ shipped (M607)** via `windows-features`.
16. **DLL Inspector** — **✅ shipped (M608)** via the `pe-header-viewer` upgrade (delay-load imports, ordinal/forwarded exports, version resource, Authenticode presence, CLR header, debug/PDB) and `dependency-walker`.
17. **Executable Dependency Viewer** — **✅ shipped (M608)** via `dependency-walker` (real Windows DLL search order).
18. **Windows SID Inspector / Account Resolver** — **✅ shipped (M609)** via `sid-account-resolver`.
19. **PowerShell Command Builder + explicit execution** — **✅ shipped (M612)** via `powershell-builder`.
20. **Environment Variable Diff** — **✅ shipped (M598)** via `environment-variables`.
21. **PATH Conflict Detector** — **✅ shipped (M599)** via `path-editor`.
22. **Runtime Installation Detector** — **✅ shipped (M600)** via `runtime-detector`.
23. **Process Environment Diff** — **✅ shipped (M595)** via `process-viewer`.
24. **Service Dependency Viewer** — **✅ shipped (M602)** via `services-viewer`.
25. **Event Log Filters / Saved Queries** — **✅ shipped (M603)** via `event-log-viewer`.
26. **Windows Permission / ACL Inspector** — **✅ shipped (M610)** via `acl-inspector`.
27. **File Lock / “Who Has This Open?” Inspector** — **✅ shipped (M611)** via `file-lock-inspector`.
28. **Process Diagnostic Bundle** — **✅ shipped (M613)** via `process-diagnostic-bundle`.

Also shipped: `system-changes` (M594), the journal and previewed-undo route for the system mutation engine ([Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract)), plus the native/PowerShell foundation (M593).

### Route map

| Route | Title | PRD items | Category |
|---|---|---|---|
| `system-changes` | System Changes | engine journal/undo, snapshot library, retention | developer |
| `process-viewer` | Process Viewer | 6, 7, 8, 9, 23 | developer |
| `port-process-lookup` (+ `local-network` upgrade) | Port → Process Lookup | 10 | developer |
| `environment-variables` | Environment Variables | 1, 20 | developer |
| `path-editor` | PATH Editor | 2, 21 | developer |
| `runtime-detector` | Runtime Detector | 22 | developer |
| `registry-editor` | Registry Editor | 3, 4 | developer |
| `services-viewer` | Services Viewer | 5, 24 | developer |
| `event-log-viewer` | Event Log Viewer | 11, 25 | developer |
| `scheduled-tasks` | Scheduled Tasks | 12 | developer |
| `startup-programs` | Startup Programs | 13 | developer |
| `installed-software` | Installed Software | 14 | developer |
| `windows-features` | Windows Features | 15 | developer |
| `dependency-walker` (+ `pe-header-viewer` upgrade) | Dependency Walker | 16, 17 | developer |
| `sid-account-resolver` | SID & Account Resolver | 18 | security |
| `acl-inspector` | ACL Inspector | 26 | security |
| `file-lock-inspector` | File Lock Inspector | 27 | developer |
| `powershell-builder` | PowerShell Builder | 19 | developer |
| `process-diagnostic-bundle` | Process Diagnostic Bundle | 28 | developer |

### Architecture and notes

- **Native access is hybrid.** One long-lived C++ helper, `windows-sys.exe` (`native/windows-sys/`), speaks JSON lines and covers processes, modules, threads, handles, ports, registry, services, the event log, SIDs/ACLs, Restart Manager, the API-set map and minidumps. Renderer-callable helper methods are a closed read-only allowlist validated in main; mutating methods are reachable only through the engine. The rarer data (scheduled tasks, Windows features, Store/Appx packages, and Local Network neighbors/routes/interfaces) comes from fixed **PowerShell 7** scripts whose arguments pass only as a base64-JSON parameter. A missing PowerShell 7 shows a "PowerShell 7 required" notice on the affected views only.
- **Elevation.** Every route runs with current permissions first, with per-row admin markers. The Phase 27 **Relaunch as Administrator** action is reused, and nothing reruns after a relaunch. HKLM registry writes require an elevated session; a hard denylist covers `HKLM\SAM`, `SECURITY`, `BCD00000000` and service `ImagePath`/`ServiceDll` values.
- **Writes** all go through the [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract) system mutation engine (previewed plan, 60 s single-use token, apply-time preconditions, journal, previewed undo in System Changes). Consequence classes: `process-management` (process operations), `registry` (registry and env/PATH), `system-config` (services, tasks, startup entries, features, uninstall, ACLs), `code-execution` (PowerShell and Runtime Detector's version probes).
- **Secrets are shown and persisted as-is** (snapshots, run history, bundles): a deliberate product choice, so there is no masking or redaction layer.
- **Web:** every new capability is desktop-only and shows the desktop-only control on the web build. The `pe-header-viewer` upgrade stays browser-capable because it is an existing browser tool.
- **Cross-checked against the real tools:** `Get-Process`, `reg export`, `sc qc`, `wevtutil qe`, `Get-ScheduledTask`, `dumpbin /dependents /imports`, `icacls`/`Get-Acl`, `whoami /all`, and PowerShell's own parser for the builder's quoting (`scripts/pwsh-crosscheck`).

### Deviations from the plan, as shipped

- The SID tool's id is `sid-account-resolver` (planned as `sid-resolver`).
- The Process Diagnostic Bundle's minidump defaults to `MiniDumpNormal`, with an optional full-memory checkbox (full dumps can be very large and contain everything in process memory). Main takes the dump directly into a private staging file, streams it into the ZIP and deletes it, rather than going through the engine's `process.dump` operation: the target is a private temporary file and consent is the explicit Export click plus the save-path grant.
- The bundle ZIP is written to a single-use, exact-file save grant from the native save dialog (`fs-grants`).
- Restart Manager graceful release/restart is the preferred path in File Lock Inspector; a handle is never force-closed.
- PowerShell Builder's quoting is checked by the `scripts/pwsh-crosscheck` corpus (about 3,000 generated pipelines round-tripped through `[Parser]::ParseInput` on PowerShell 7.6.6, 0 failures).
- The system preview UI is a new `app-system-change-preview` component, not a generalized `app-mutation-preview`, so the Phase 29 filesystem preview and its specs stay untouched.
- PowerShell 7 detection also accepts the `%LOCALAPPDATA%\Microsoft\WindowsApps` App Execution Alias (winget installs it as MSIX), and Windows features are listed through CIM because importing the DISM module requires elevation.

### Scope ceiling

**Phase 31 is a Windows troubleshooting workbench, not a system-administration suite.** Explicitly out of scope: remote machines, GPO/AD administration, and user/group management; creating or deleting services and driver control; creating or editing scheduled tasks (enable/disable only); deleting registry keys (values can be deleted; a key DUDE created can be removed only while it is still empty); recursive ACL reset or propagation rewrites (ACL edits cover a single object); and force-closing handles.

Static Windows error/HRESULT decoding is reference data and remains covered by the Error Code Reference in Phase 18; the Event Log Viewer and Scheduled Tasks link status codes to it.

Every operation that changes system state — process termination/restart, PATH/environment edits, registry writes, service changes, scheduled-task and startup-entry changes, Windows feature changes, software uninstall, permission changes, or PowerShell execution — satisfies [Security Boundaries](../architecture/SECURITY_ARCHITECTURE.md#security-boundaries)'s security boundaries and the [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract) contract: explicit intent, clear target, a preview, and a confirmation proportional to risk.

**Goal achieved:** DUDE is genuinely useful for routine Windows developer/system troubleshooting without becoming a general-purpose system-administration suite.

<a id="phase-31b"></a>

## Phase 31B — Device Identity, Scoped State and Migration

**Status:** complete, Milestones 616–627 plus one gate-fix commit; automated acceptance recorded in [Phase 31B acceptance evidence](../delivery/PHASE31B_ACCEPTANCE.md), with one installed-build manual pass still owed.

Phase 31B gave the desktop a durable, identified, scoped local store without a Hub: the exit gate was stable device IDs, scoped settings, repository adapters, secure secret references, recoverable migration and a durable local outbox. Hub registration, replay and sync are Phases 31C/31D.

| Milestone | Delivered |
|---|---|
| 616 | `dude-app://app/` privileged scheme replaced the loopback static server. The old random port meant a new origin per launch, so production desktop renderer state was lost on every restart. A spike confirmed `ws://` (loopback and LAN), secure context, WebCrypto, storage and the sandbox CSP host-source all work from the new origin, so the collaboration transport was left unchanged and the planned pinned self-signed `wss://` fallback was not needed |
| 617 | LLM chat moved to the sender-checked `dude:llm:chat` IPC call; the loopback HTTP LLM proxy was deleted |
| 618 | `@dude/persistence` (UUIDv7, device/environment records, `SettingDefinition`s and the policy scope rule, repository ports, in-memory adapters with contract suites, `SecretRef`, entity codecs), `@dude/sync` outbox model and coalescing, device-store/agent-RPC/registration-stub contracts, `ToolMetadata.settingScopes` |
| 619 | `apps/device-agent` state service: `node:sqlite` in WAL with `synchronous=FULL`, checksummed migration runner with `VACUUM INTO` backups and newer-schema refusal, UUIDv7 identity with MachineGuid-hash clone detection, atomic record-plus-coalesced-outbox commits, repositories, closed RPC, reset, and a hard-kill crash test |
| 620 | Electron main broker: fork, private `MessagePort` to the child only, 0.5/2/8 s backoff and an unavailable state after more than three crashes in two minutes, sender-checked validated `dude:store:*`/`dude:device:*` handlers, quit coordinator (flush, clean-exit mark, checkpoint) and a store-based crash marker |
| 621 | Desktop JSON state, mutation journals, snapshot headers and PowerShell history moved into the store with a JSON fallback and drain; one-shot legacy `userData` import into `legacy-import/<timestamp>/` |
| 622 | Secret references with `safeStorage` ciphertext in the store, a purpose-allowlisted sender-checked secrets IPC with no `get`, AI base URL/model as a device document, `SecretsService`, and removal of the `settings` LLM pseudo-namespace |
| 623 | Renderer boot snapshot before bootstrap, device key/value backend (1 s debounce, journaled settings immediate, flush handshake), scope recorded per write, one-shot renderer localStorage import, appearance prepaint mirror, `DeviceIdentityService` (web installation ID), health service and degraded banner, onboarding on `PersistenceService`, `settingScopes` conformance |
| gate fix | `resolveKvScope` moved into `@dude/persistence`; `check:desktop` requires an Electron production build (`ng build --configuration production,electron`, base href `/`) |
| 624 | `EntityCollection`s for favorites (one record per pin), pipelines, user scripts, projects and workspace templates with optimistic update and rollback; journaled documents for home layout and usage; journaled `setting` ops for appearance and reopen-on-restart; bundle import through codecs; removal of every `migrateX`, `storageMigrations`, `moveLocalValue`, the legacy Home panel and the bundle's `homePanel` |
| 625 | History and network-run repositories (SQLite with retention in the write transaction on desktop, IndexedDB on web) and a one-shot IndexedDB import |
| 626 | Settings › This Device, recovery actions, and two-step token-bound *Clear data* and *Reset this device* under the Destructive-Action Contract; Data & Privacy delegates to them; the high-consequence gate runs the new boundary specs |
| 627 | Data-scope inventory classification, documentation, decision records PD-013 to PD-022 and acceptance evidence |

### Architecture and notes

- (Replaced in Phase 31C by the resident Device Agent process.) The state service is an Electron utility process named in code `apps/device-agent`; it is not the privileged Device Agent execution boundary, and the docs call it the *state service* to keep the two apart.
- Only an explicit list journals into the outbox: favorites, pipelines, user scripts, projects, workspace templates, appearance, reopen-on-restart, home layout (with notes) and usage/insights. Ops coalesce per entity and carry the status `unsent-standalone`.
- Tool `local` preferences default to `environment` scope; session, user-choice and none inputs are `local-only`; manifest `settingScopes` override a key.
- Usage/insights and the Home layout are `environment`-scoped (a deliberate rewrite of the earlier "usage stays local" statement); they become sync-eligible only after explicit consent in 31D.
- The device display name defaults to "Windows PC", never the hostname.

### Deviations from the plan, as shipped

- The M617 plan's pinned self-signed `wss://` collaboration fallback was **not built**: the spike showed `ws://` works from `dude-app://`.
- The plan's M617 title bundled collaboration with LLM; only the LLM move shipped in that milestone.
- A separate gate-fix commit was needed after M623 (portable `resolveKvScope`, desktop build precondition).

### Scope ceiling

**Phase 31B is a local store, identity and scope foundation, not synchronization.** Explicitly out of scope and unbuilt: the Hub, device registration handshake, Hub revisions, outbox replay, conflicts and the first-sync enrollment preview (31C/31D); a mobile persistence adapter (31H); and recovery of renderer data written by earlier production launches at random-port origins.

**Outcome (Milestones 616–627):** met, with one manual installed-build pass owed.

<a id="phase-31c"></a>

## Phase 31C — Self-Hosted Hub, Identity and Canonical Persistence

**Status:** complete, Milestones 628–648 plus fix commits; automated acceptance and measurements are recorded in [Phase 31C acceptance evidence](../delivery/PHASE31C_ACCEPTANCE.md), which also lists the manual, installed-build and elevated checks still owed. Decisions are PD-023 to PD-037 in the [decision log](DECISION_LOG.md#phase-31c-implementation-decisions), with amendments to PD-025 and PD-026 recorded there.

Phase 31C delivered a user-owned Hub that starts independently of Electron, owns a canonical SQLite database through its own process, has a single owner with bootstrap and three recovery paths, registers devices with Ed25519 keys, exposes an authenticated realtime foundation, serves an admin web, and a resident per-user Device Agent that holds the device key and Hub connection. The milestone numbers differ from the planned 628-649 map because the separate device-assisted-recovery milestone merged into the admin UI and wizard work, and the appx milestone disappeared when the target was dropped.

| Milestone | Delivered |
|---|---|
| 628 | Decision records PD-023 to PD-037 and document reconciliation |
| 629 | `@dude/sqlite-store`: `node:sqlite` open/WAL/`quick_check`, transaction and meta helpers and the checksummed migration runner extracted from the Device Agent |
| 630 | `apps/hub` scaffold: data-directory layout and strict config, self-signed ECDSA P-256 identity with a small DER writer and SPKI pin, canonical migration 0001, Fastify HTTPS server with `/api/v1/hello`, traversal-guarded static hosting with SPA fallback, the `dude-hub` CLI, TypeBox contracts on `@dude/contracts/hub` and the transport-port `@dude/api-client` |
| 631 | Canonical repository: `commitCanonical` writes record, change-feed entry and applied op ID atomically under a global revision with duplicate-op idempotency; WAL hard-kill durability check |
| 632 | Security baseline: headers and CSP, Host allowlist, credential-typed Origin/Fetch-Metadata/CSRF, body limits, rate limits, persisted throttling, closed audit event list with 365-day/100,000-event retention, ConfirmationStore, local admin named pipe |
| 633 | Owner bootstrap with a one-time setup token, Argon2id and ten recovery codes; `dude-hub setup-token` with an ACL'd hand-off to a user profile |
| 634 | Cookie and device-bound bearer sessions, sign-in/out, session list/revoke, two-step revoke-all and recovery-code regeneration, password change, recovery-code recovery, elevated `dude-hub owner reset` (migration 0002) |
| 635 | `dude-hub.exe` Node 24 SEA with a startup self-test, non-root Docker image with a pinned-cert healthcheck, `check:dockerfiles` and the CI `docker-smoke` job |
| 636 | Device registry: 10-minute pairing codes, Ed25519 enrollment, 15-minute device tokens, owner list/rename/recovery-trust/revoke, device self-service and device-bound owner sessions |
| 637 | Authenticated realtime WebSocket with presence and registry events; `dude-hub tls rotate`, `status` and `activate` with dual-pin acknowledgement and hot swap |
| 638 | Device Agent as a separate process over `@dude/agent-pipe` (authenticated per-user named pipe); store quarantine moved into the Agent; appx target dropped |
| 639 | Windows service (WinSW 2.12.0, `NT SERVICE\DudeHub`), LAN mode with a Private-profile firewall rule, `doctor`, `purge` under the Destructive-Action Contract, `hub:stage` and the `hub-service.yml` workflow |
| 640 | Resident Agent lifecycle (outlives the window, per-user sign-in start, Settings background-agent row) and DPAPI-wrapped Ed25519 device keys through `windows-sys` |
| 641 | `hub_enrollment` in the Device Store (migration 0002), widened enrollment state, clone-detection and reset handling |
| 642 | Agent Hub client (pinned enrollment, challenge tokens, realtime, TLS pin following, revocation detection), sender-checked `dude:hub:*` desktop bridge and the `@dude/api-client` parity spec |
| 643 | `hub-web` host kind and the `production,hub` build, host-listed Settings sections, `HUB_ADMIN` port, `/hub/*` pages (shell exception #12), CSP inline-script hashes |
| 644 | Hub admin UI (Environment & Hub, Devices, Security & Sessions) and the device-assisted owner recovery backend with Windows Hello/CredUI gate |
| 645 | Local Hub setup wizard (elevated token hand-off, recovery codes shown once, automatic self-enrollment), Update Hub and owner recovery UI |
| 646 | Optional Hub component: `DUDE-Hub-Setup.exe`, default-off checkbox in the desktop installer, combined `SHA256SUMS`, installer registry fix |
| 647 | Hub end-to-end, CSP sweep and measurements (`npm run test:e2e:hub`, `npm run measure:hub`, CI job `hub-e2e`) |
| 648 | Phase close-out: documentation, decision amendments and acceptance evidence |

Fix commits: the Windows MachineGuid registry path (a Phase 31B regression that had disabled clone detection), clear-all-data spec isolation under the full suite, the Dockerfiles for the new `@dude/agent-pipe` workspace, the Hub web admin adapter spec timeout under the full suite, and a collapsed backslash in a hub-bridge spec fixture.

### Architecture and notes

- The Hub is Fastify with TypeBox schemas, HTTPS only, packaged as a Node SEA and run as a Windows service, container or foreground process; the CLI talks to the running service over a local admin channel and never opens the database.
- The Device Agent is a separate resident per-user process reached over an authenticated named pipe; it still never executes tools.
- Credential types are explicit per route; a device credential alone never grants owner rights.
- The canonical database is a skeleton: identity tables plus `records`, `change_feed` and `applied_ops` behind an atomic repository, with no public record endpoints.
- A device keeps its standalone environment ID and local records on enrollment; re-keying belongs to Phase 31D.
- The Hub web is the shared Angular app built with a `hub` configuration (no service worker) behind sign-in, with a small admin surface.

### Deviations from the plan, as shipped

- **Update Hub** elevates the bundled `DUDE-Hub-Setup.exe` in `/UPDATE` mode, not `resources\hub\dude-hub.exe`, and is offered only from a per-machine (Program Files) install because a per-user install's resources are user-writable (amends PD-025).
- The resident Agent's **sign-in start** falls back to the `HKCU` Run key because standard users are denied `ONLOGON` scheduled tasks; the **pipe name** derives from a hash of the store directory (per-user by location), not the SID (amends PD-026).
- The planned separate device-assisted recovery milestone merged into M644/M645, and the milestone numbers shifted accordingly.
- The desktop installer used to delete all of `HKLM\Software\DUDE` on uninstall and update, which would have removed the Hub's registration on every desktop update; Milestone 646 fixed it.
- Hub inline-script CSP uses hashes of the `index.html` inline scripts; `'unsafe-inline'` is not allowed.
- The rate limiter counts only `/api` requests, and pairing and device-challenge throttles are per IP only so a failure flood cannot lock every device out.
- WinSW 2.12.0 is sha256-pinned, but the pinned hash was recorded from the official release on first download (trust-on-first-download).

### Scope ceiling

**Phase 31C is a Hub, identity and device-registry foundation, not synchronization.** Explicitly out of scope and unbuilt: record endpoints, import, revisions seen by clients, outbox replay and conflicts (31D); the authenticated shared-state Hub web, Hub web caching, trusted certificates and private-access guidance (31E); Internet/public mode and its verification (31F); encrypted backup, restore and Hub transfer (31G); Android (31H-31I); collaboration persistence (31J); passkeys/TOTP and organizational identity (Phases 81/96); and remote execution (Phase 88).

**Outcome (Milestones 628-648):** measured results and owed manual passes are recorded in [Phase 31C acceptance evidence](../delivery/PHASE31C_ACCEPTANCE.md).

<a id="phase-31d"></a>

## Phase 31D — Synchronization and Offline Reconciliation

**Status:** complete, Milestones 649–662 plus fix commits; automated acceptance and measurements are recorded in [Phase 31D acceptance evidence](../delivery/PHASE31D_ACCEPTANCE.md), which also lists the manual two-machine pass still owed. Decisions are PD-038 to PD-049 in the [decision log](DECISION_LOG.md#phase-31d-implementation-decisions), implemented with the amendments recorded there.

Phase 31D made two enrolled desktops converge through the Hub: nine consent-gated categories, revision-checked push, pull and snapshot routes, a durable offline outbox that replays after a restart, three-way field merge with a permanent conflict inbox, a first-sync preview with a recovery snapshot, retention with snapshot rebase that does not resurrect deletes, revoked-device freezing, live apply into the running renderer, Settings › Sync and a shell sync indicator, and per-device sync statistics for the Hub owner.

### Milestone map

| Milestone | Delivered |
|---|---|
| 649 | Decision records PD-038 to PD-049 and the planned design section |
| 650 | `@dude/sync` core: categories, `SYNC_POLICIES`, three-way merge, `SYNC_LIMITS`, `SyncStatus`, `stripNonSyncable` |
| 651 | `sync.schema` contracts, `changes-available` realtime event, sync audit events, `HUB_PROTOCOL_VERSION` 2 (minimum client 1) and `hubSupportsSync` |
| 652 | Hub migration 0003 (`records(environment_id, revision)` index, `device_sync_state`, `sync_floor`, `sync_retention_days`), policy enforcement in `commitCanonical`, the sync repository and the setting-key codec check |
| 653 | `/api/v1/sync` push, changes, snapshot, state, summary and the two-step environment clear; device-only `changes-available`; compaction timer; `@dude/api-client` methods |
| 654 | Device-store migration 0003, outbox status by enrollment, kv journaling of syncable settings with `KV_ENTITY_BINDINGS`, per-device usage |
| 655 | Agent sync engine (apply-remote, push results, rebase, conflicts, quarantine, status) with `sync.*` RPCs and frames |
| 656 | First-sync preview and apply (Merge, Use Hub, Keep local) with a recovery snapshot, single-use token and re-keying |
| 657 | Lifecycle: revoked → Continue standalone, unenroll, Clear data on an enrolled device with optional delete from Hub, Reset; confirmation-boundary specs |
| 658 | Desktop sync bridge (`dude:sync:*`, sender-checked) and renderer live apply |
| 659 | Hub admin sync statistics (`hub.owner.syncSummary`, Devices and Environment & Hub panels) |
| 660 | Settings › Sync section and the shell sync indicator (shell exception #13) |
| 661 | Exit-gate suites and measurements (`npm run test:sync`, `npm run test:e2e:sync`, `npm run measure:sync`) |
| 662 | Phase close-out: documentation, decision amendments and acceptance evidence |

Fix commits: a data-scope inventory refresh after the store migration and the move of the pure JSON diff and sync display helpers into `@dude/sync` (the inventory rule that portable logic lives in packages).

### Architecture and notes

- The Hub is a revision arbiter: `SYNC_POLICIES` assigns `lww`, `per-device` or `merge3` per entity type and the Hub rejects stale `merge3` bases; devices do the merging against the last Hub version they saw.
- REST carries all synchronization and the WebSocket only nudges, so a lost nudge costs latency, never data.
- Tool-preference sync is authorized twice: the device journals tool-id-shaped `environment` keys, and the Hub's manifest-derived `isSyncableSettingKey` is the authority (the Agent may not depend on `@dude/tool-registry`).
- "Held" is derived, not stored; re-enabling a category forces a snapshot rebase; schema-newer remote records are deferred rather than dropped.
- Standalone conversion drops the outbox; data stays in `records` and a later first sync re-journals it.

### Gotchas found

- After compaction the Hub head revision must be `max(feed, floor)`, and an upsert based on a compacted tombstone must conflict rather than resurrect the record (found by the retention scenario, fixed in M661).
- Electron-as-Node (BoringSSL) rejects the Hub's self-signed certificate as a trust anchor, so unpackaged desktops cannot enroll; the packaged SEA Agent is unaffected and the e2e uses `DUDE_E2E_AGENT_NODE`. Fixed in Phase 31E (Milestone 664, pin-only verification) and `DUDE_E2E_AGENT_NODE` was removed.
- An automatic merge must assign a new op id, otherwise an in-flight push of the older payload clears it.
- The process-viewer confirmation-boundary spec timed out once under full `npm test` load and passes in `test:high-consequence`.

### Scope ceiling

**Phase 31D synchronizes desktops only.** Unbuilt at its close: the shared-state Hub web (delivered in 31E), sync-time revoked-device verification for Internet exposure (31F), encrypted backup and transfer (31G), Android sync (31H–31I), collaboration persistence (31J), end-to-end encrypted or extended categories (Phase 82), secret synchronization and non-tool app-namespace settings.

**Outcome (Milestones 649–662):** met, with the two-machine manual pass owed; see [Phase 31D acceptance evidence](../delivery/PHASE31D_ACCEPTANCE.md).

<a id="phase-31e"></a>

## Phase 31E — Hub-Served Angular Web and Private Access

**Status:** complete, Milestones 663–682 plus fix commits; automated acceptance is recorded in [Phase 31E acceptance evidence](../delivery/PHASE31E_ACCEPTANCE.md), which also lists the manual passes still owed. Decisions are PD-050 to PD-062 in the [decision log](DECISION_LOG.md#phase-31e-implementation-decisions), implemented with the amendments recorded there.

Phase 31E made the Hub-served Angular app a full authenticated shared-state web client and made private-mode access trustworthy: browser device rows and cookie-only web record routes, an in-browser three-way merge with realtime, a public-asset-only service worker with a sign-out wipe, sandboxed tools that run under the Hub CSP, pin-only device TLS verification, configured names, a built-in local CA, certificate import, reverse-proxy mode, a gated public mode, per-principal rate limits and one endpoint diagnostics engine.

### Milestone map

| Milestone | Delivered |
|---|---|
| 663 | Decisions PD-050 to PD-062 and the 31D/31E doc reconciliation |
| 664 | Pin-only Hub TLS verification (`secureConnect` SPKI check); self-signed leaves drop `keyUsage`; the BoringSSL/Electron-as-Node enrollment fix; `DUDE_E2E_AGENT_NODE` removed |
| 665 | Configured Hub names, SAN and Host allowlist (`exposure` config block, `tls names list`, `add`, `remove`, canonical origin for pairing; public parsed but refused) |
| 666 | Sandboxed tools load static `sandbox/*.html` loader pages by `src` on every host (one-shot handshake; Hub per-page CSP and `frame-ancestors 'self'`; CORS only for `/assets/vendor/pyodide/*`) |
| 667 | Hub web CSP relaxations (`connect-src https: wss:`, `img-src https:`, `camera=(self)`, never `'unsafe-eval'`); JSON Schema Validator moved to `@cfworker/json-schema`; Protobuf Decoder reflection fallback |
| 668 | Built-in local CA, default for new Hubs (name-constrained root, 397-day leaf, DPAPI LocalMachine-protected CA key, isolated renewal re-certifying the same leaf key, `tls ca init`, `status`, `export`) |
| 669 | Hub web service worker for public assets only (`ngsw-config.hub.json`, no `dataGroups`, navigation excludes `/api` and `/sandbox`; offline map and cache budget for the hub build) |
| 670 | Static serving upgrades (br/gzip negotiation, ETag/304, HEAD, streaming, MIME) |
| 671 | Packaging always ships the web UI (multi-stage Docker image; `hub:stage` and `hub:sea` build it on demand or fail; CI `docker-smoke` asserts `/` serves the app) |
| 672 | Hub web share links (private Hub link and public companion link, `index.hub.html`), desktop "Open Hub web" and "Install root certificate" |
| 673 | Certificate import (`tls import`) and proxy pins (`tls proxy-pin add`, `activate`, `remove`, `list`); Hub migration 0004; device-store migration 0004; hello advertises `proxySpkiSha256` |
| 674 | Trusted Hub e2e (no `ignoreHTTPSErrors`: Chromium SPKI-list pin and `NODE_EXTRA_CA_CERTS`) and the sandbox 304 header fix |
| 675 | Reverse-proxy mode (`network proxy on --trusted --public-origin`), the `network mode public` gate, HSTS only with a trustable certificate, per-principal rate limits and flood guard |
| 676 | Diagnostics engine (13 readiness checks marked verified, claimed or not-checked; `doctor --json`) |
| 677 | Browser device rows (Hub migration 0005) and cookie-only `/api/v1/web` routes; owner sockets receive `changes-available` and `web-access-changed`; the summary reports device kind and `paused` |
| 678 | Settings › Endpoint & Exposure (Hub report, browser checks, Agent "This device" panel, `hub.diagnostics` RPC) |
| 679 | Hub web shared state (boot attach and snapshot, Hub kv backend and entity collections, browser merge3 with a conflict dialog, online-only writes, realtime client) |
| 680 | Hub web Sync UI (web-access toggles, per-device table), sign-out wipe, read-only offline boot |
| 681 | Exit-gate suites (`e2e/hub/30-shared-state`, `40-routes-sweep` of all 333 tools and the workbench routes) |
| 682 | Phase close-out: documentation, decision amendments, acceptance evidence |

Fix commits: `3a92fc2c` (sync summary schema spec for device kind and paused), `893aa005` (the Hub e2e flow waits for the full-page sign-in and sign-out navigation) and `5279b9d8` (a 5xx classifies as unreachable; realtime recovery after an HTTP-only failure; `cbor-x/decode-no-eval`; the offline-map generator ignores an orphan chunk).

### Architecture and notes

- A browser is the existing cookie session plus a key-less browser device row: attribution and usage ownership, never a credential. It cannot get a device token, enroll, be recovery-trusted or block pin rotation.
- The Hub stays the revision arbiter. The browser merges against the base it read and a real conflict opens a dialog at once; there is no browser outbox, so shared writes are online-only and the Hub wins on first attach.
- The service worker caches public assets only; sign-out wipes every origin store except those caches, and session expiry only locks to sign-in.
- Device TLS no longer relies on the TLS library trusting the leaf: pinning is verified at `secureConnect`. The local CA is a convenience for browsers, not a device trust anchor.
- Exposure changes (names, CA, import, proxy, mode) stay elevated admin-pipe actions; the Settings and diagnostics UIs are view-only with copyable commands.

### Gotchas found

- A `srcdoc` iframe inherits the embedding page's CSP, which is why every sandbox moved to a static page loaded by `src` (the 31C playground finding).
- A 304 revalidation merges its headers into the cached response, so the loader pages' frame and CSP headers must be sent on 304s too; otherwise the app's `X-Frame-Options: DENY` blocked every re-created frame.
- Chromium refuses service worker registration on an origin with a certificate error, so the Hub e2e must trust the certificate (a Chromium SPKI list), and Playwright's `APIRequestContext` needs `NODE_EXTRA_CA_CERTS` set before it starts.
- BoringSSL (Electron-as-Node) wants `keyCertSign` in `keyUsage` on a self-issued trust anchor if the extension is present; dropping `keyUsage` fixed it, and pin-only verification removed the dependency.
- esbuild lists an orphan chunk in its metafile for a dynamic import that is folded away in the Pages and desktop builds, which broke the offline-map script and so the Pages postbuild from Milestone 679 until `5279b9d8`.
- `cbor-x`'s `new Function` probe tripped CSP reporting on the Hub even though decoding worked; the no-eval entry point avoids it.
- The service worker answers 504 when offline; a 5xx must read as Hub unreachable, not incompatible, or the page refuses writes forever.
- `npm test` stops at the package stage when it fails, so a green-looking run can mean `ng test` never ran; check that it did. Two `EnvironmentTeardownError` suite flakes under full load pass on rerun.

### Scope ceiling

**Phase 31E delivers private mode.** Public (Internet) mode can be configured but is refused until Phase 31F, which also owns external reachability verification, ACME/DNS/dynamic address, sync-time revoked-device verification for Internet exposure and the review of the `DUDE_HUB_TEST_*` knobs. Encrypted backup and transfer are 31G, Android sync is 31H–31I and collaboration persistence is 31J.

**Outcome (Milestones 663–682):** met, with the manual passes listed in the acceptance evidence owed; see [Phase 31E acceptance evidence](../delivery/PHASE31E_ACCEPTANCE.md).

<a id="phase-31f"></a>

## Phase 31F — Internet Readiness and Security Hardening

**Status:** complete, Milestones 683–699; automated acceptance is recorded in [Phase 31F acceptance evidence](../delivery/PHASE31F_ACCEPTANCE.md), which also lists the manual and real-network passes still owed. Decisions are PD-063 to PD-068 in the [decision log](DECISION_LOG.md#phase-31f-implementation-decisions), implemented with the amendments recorded there.

Phase 31F released Internet (public) mode behind an elevated readiness gate and hardened the Hub for exposure: persisted flood state with automatic IP blocks, owner step-up re-authentication with session rotation, owner security alerts, a built-in ACME client, dynamic-address detection, validated public firewall rules and a native-listener audit, Hub-observed external reachability, sync-time revoked-device verification and test knobs that release builds ignore.

### Milestone map

| Milestone | Delivered |
|---|---|
| 683 | Decisions PD-063 to PD-068 |
| 684 | `DUDE_HUB_TEST_*` knobs compiled out of release builds (`npm run hub:compile:test` -> `dist/hub-test`; harnesses and e2e use the test bundle; public mode refuses to start if one is set) |
| 685 | Persisted flood guard and automatic IP block (Hub migration 0006 `ip_blocks`; `dude-hub security blocks list\|clear`) |
| 686 | Owner step-up re-authentication and cookie session rotation (migration 0007; `POST /auth/step-up`; `step-up-required` on pairing codes, recovery regeneration and revoke-all) |
| 687 | Hub web step-up dialog and a shared CSRF token holder |
| 688 | `throttle.locked` audit, `audit-ips truncated` option and the owner security alerts API (`/api/v1/security/alerts`) |
| 689 | Security alerts in Settings › Security on web and desktop |
| 690 | ACME (RFC 8555) client library: JWS, CSR, http-01 listener and a fake ACME server |
| 691 | ACME issuance, renewal and `tls acme` CLI wired into the dual-pin rotation (source `acme`, no migration) |
| 692 | Dynamic-address detection, address watcher (`network.address-changed`) and DNS resolution diagnostics |
| 693 | Public and ACME http-01 firewall rules and the native-listener audit (`public-firewall-rule`, `native-ports-exposed` in `doctor`) |
| 694 | Hub-observed external reachability echo, diagnostics check and the Hub web verify button |
| 695 | Desktop "Test from this device" probe through the Agent (`hub.reachabilityEcho`) |
| 696 | Sync-time revoked-device verification, `device.revoked-attempt` audit and the Internet scenario suite |
| 697 | Public mode released behind the elevated readiness gate (`evaluatePublicReadiness`; the unreleased flag and variable removed) |
| 698 | Operator-certificate name coverage, readable local-CA name-constraint admin error and the real Caddy check (`npm run check:caddy-proxy`) |
| 699 | Phase close-out: documentation, acceptance evidence |

### Architecture and notes

- The gate is advisory about nothing it cannot see: the readiness report is built by the running Hub and the elevated CLI adds the Windows-only firewall and listener inspections. Exposure changes remain elevated admin-pipe actions and every UI is view-only.
- External reachability is the Hub's own observation of a request source arriving through a configured name from a public address. No client reports a result and no third-party service is used.
- ACME certificates enter the same dual-pin stage/acknowledge/activate rotation as every other certificate, and renewal reuses the leaf key so the device pin is stable.
- Revocation is effective on the next request: tokens are re-resolved on every call and a push re-verifies its actor inside the commit transaction.

### Gotchas found

- Imported and ACME certificates only have to cover the operator's configured names, not every Hub name; requiring full coverage made the public gate unreachable (fixed in 698).
- A name outside the local CA's name constraints surfaced as an opaque 500 until the admin method mapped it to a bad request.
- A stale subagent re-applied already-committed Milestone 686 edits after finishing, leaving duplicate declarations in `auth.schema.ts` and `client.ts`; they were restored from HEAD at the start of close-out.
- Registering `ip_blocks` in the data-scope inventory is required, or `lint` and `npm test` fail.

### Scope ceiling

**Phase 31F delivers Internet readiness, not Internet verification in the field.** A real Let's Encrypt issuance, reachability from a phone on cellular, installed-service and elevated runs and the first CI runs of the new suites are owed. Chain verification of an ACME certificate against public roots, TLS-ALPN-01 and DNS-01, DDNS updating, UPnP and any second factor are not implemented. Encrypted backup and transfer are 31G, Android sync is 31H–31I and collaboration persistence is 31J.

**Outcome (Milestones 683–699):** met, with the manual and real-network passes listed in the acceptance evidence owed; see [Phase 31F acceptance evidence](../delivery/PHASE31F_ACCEPTANCE.md).

<a id="phase-31g"></a>

## Phase 31G — Encrypted Backup, Restore and Hub Transfer

**Status:** complete, Milestones 700–719; automated acceptance is recorded in [Phase 31G acceptance evidence](../delivery/PHASE31G_ACCEPTANCE.md), which also lists the manual and second-machine passes still owed. Decisions are PD-069 to PD-074 in the [decision log](DECISION_LOG.md#phase-31g-implementation-decisions), implemented with the amendments recorded there.

Phase 31G made a self-hosted Hub recoverable and movable: a passphrase-encrypted, verified backup file, an offline staged restore that gives the restored Hub a new identity and a higher authority epoch, a fence that retires the old Hub, re-attach pairing codes, a device reconnect that keeps local data and pending edits and ends in the existing first-sync preview, a rebase that never deletes history the Hub regressed past, a Hub web authority gate and a view-only Backup & Transfer section.

### Milestone map

| Milestone | Delivered |
|---|---|
| 700 | Decisions PD-069 to PD-074 |
| 701 | Hub authority epoch and state (`authority_epoch`, `authority_state` in `meta`, default 1 and active) reported as optional fields in `hello`, the device token response, the realtime welcome and sync responses (no protocol bump, no migration) |
| 702 | `@dude/hub-backup`: the `.dudebackup` format (plaintext reader header, XChaCha20-Poly1305 64 KiB chunks, manifest inside the encryption, injected KDF, random and clock, NFKC passphrase, 512 MiB plaintext and 32-file ceiling) |
| 703 | Device authority detection (device-store migration 0005 `hub_enrollment.authority_epoch`; `authority-changed` with reasons `transferred`, `instance-changed`, `epoch-lower`; hello checked on every connect, refresh, token, welcome and revoke confirmation; sync phase `needs-reconcile`; one recovery snapshot) |
| 704 | Hub backup core: scrubbed `VACUUM INTO` snapshot, Node Argon2id (64 MiB, 3 passes, 1 lane), verified atomic write, retention that never deletes the newest, DPAPI-protected derived schedule key |
| 705 | Device rebase safety: persisted `sync_reconcile_required` flag (`cursor-ahead`, `epoch-lower`, `history-regressed`); a rebase refuses to delete or move the cursor when an acknowledged local entity is newer than the snapshot; snapshots before any legitimate deletion |
| 706 | Backup admin methods (`backup.create.preview\|apply`, `list`, `verify`, `schedule.set\|off\|status`), the scheduler, `backup.schedule` config, nine closed-list `backup.*` audit events and the confirmation-boundary spec |
| 707 | `dude-hub backup create\|list\|verify\|schedule` CLI with no-echo passphrase input (`DUDE_HUB_BACKUP_PASSPHRASE`, standard input or a prompt, never a flag) |
| 708 | Hub restore library and migration 0008 (`devices.needs_re_pair`, `pairing_codes.reattach_device_id`): offline staged restore, new instance id, epoch = source + 1, desktop devices marked needs-re-pair with keys revoked, transient, TLS and `device_sync_state` cleared, `hub.json` sanitized, replaced data moved to `backups/replaced-<stamp>` |
| 709 | `dude-hub backup restore` (offline, elevated with a service installed, exact phrases `REPLACE HUB DATA` and `THE OLD HUB IS GONE`), `backup create --for-transfer` and `backup reactivate` commands |
| 710 | Transfer fence (retired Hub answers `hello` and static assets only; everything else 503 `hub-transferred`, sockets closed 4004), `isHubTransferredError`, reactivate server side (epoch + 1) |
| 711 | Re-attach pairing codes (`POST /pairing-codes {reattachDeviceId}`) and `GET /api/v1/backup/status` (owner session, read-only) |
| 712 | Device `hub.reconnect` (`{pairingString, acknowledged: true}`) through the Agent RPC, desktop bridge, preload, `DesktopHubBridge`, the Hub admin port and a Settings reconnect panel; recovery snapshot, enrollment replaced, only sync bookkeeping reset |
| 713 | Hub web boot authority gate (blocking notice, refusal of a lower epoch with forget-and-continue, local-only `__device__:hubAuthority`, runtime lock on 503 `hub-transferred` or close 4004) |
| 714 | Settings › Backup & Transfer (view-only, desktop and Hub web) through the owner `backupStatus` call; Devices "Needs re-pair" badge with "Create re-pair code" |
| 715 | `e2e/hub/50-backup-transfer.spec.ts`: six serial real-process tests (transfer, 503 and notice, restore onto a second data directory, old password signs in, re-attach, negative restore checks, reactivate) |
| 716 | `e2e/sync/20-restore-reconnect.spec.ts`: eleven tests with two real desktops (stale-history restore with pending offline edits, union of all edits, nothing deleted, old Hub refused, live convergence) plus a transfer scenario |
| 717 | `hub.reconnect` also allowed from `offline` and `connecting`, so a lost old Hub no longer forces force-unenroll; the Settings panel shows collapsed under "The Hub moved to a new address?" |
| 718 | `npm run measure:backup` records backup, verify and restore cost |
| 719 | Phase close-out: documentation, acceptance evidence |

### Architecture and notes

- A restored Hub is a new authority: new instance id, epoch + 1, every desktop device marked for re-pair with its key revoked, so nothing from the old authority is accepted by it and nothing it says is accepted as the old one. Certificates are never in a backup, so the restored Hub issues its own TLS identity.
- The fence is the first Hub request hook so it outranks the IP block, the rate limit and authentication. `hello` stays open on purpose: devices and browsers need it to learn that the Hub moved.
- Devices stop before any traffic when the Hub's identity or epoch differs and never read a changed Hub as a revoked one; the rebase guard is independent of the hello check and protects the stale-history case where a Hub looks legitimate but has less history than the device.
- The only secret stored beyond the passphrase's lifetime is the DPAPI-protected derived key for scheduled backups (PD-074); the passphrase is never stored, logged or audited.
- Backups are whole-buffer by design (PD-069): fine for typical Hub sizes, but memory is about five times the database and a live Hub stalls for about 2.5 seconds on a 170 MiB database (measured in the acceptance evidence). A streaming design is a later improvement.

### Gotchas found

- A restored Hub that gets a fresh TLS certificate at the old address makes devices report `untrusted-tls`, not `authority-changed`; reconnect handles both. The e2e drill reuses the old TLS directory for the second Hub to observe `authority-changed` at the old address.
- The Hub web sign-out wipe spec had to exempt the boot authority record: sign-out wipes it with the origin, but the boot gate rewrites it on the sign-in page the sign-out lands on (local-only, no secret), so the e2e wipe assertion excludes `__device__:hubAuthority`.
- A device whose Hub moved to a new address while the old Hub is gone only ever sees `offline`, and `hub.reconnect` first refused that state, so the only way out was a force-unenroll that strands local data (fixed in 717).
- A stale-history restore (a backup older than the devices' cursors) is the dangerous case: the old rebase silently deleted acknowledged local entities missing from the Hub's snapshot. The 705 guard and the 716 drill exist for it.
- Measurements must use the release bundle, not the test bundle: the test bundle relaxes rate limits and would flatter the numbers.
- Restore does not carry certificates, the CA or ACME keys, so a restore always needs the operator to re-enable LAN, proxy and public exposure with the usual elevated commands.

### Scope ceiling

**Phase 31G delivers manual authority transfer, not automatic failover.** There is no leader election, multi-master or live standby, no streaming or compressed backup, no UI that sets or runs a backup (the owner UI is view-only and the schedule is set from the elevated CLI), no recovery-key file and no backup of certificates. The real second-machine pass, installed-service and elevated runs, the DPAPI schedule key on a real account and the first CI runs of the new suites are owed. Android sync is 31H–31I and collaboration persistence is 31J; a 31G desktop and Hub preview does not complete DUDE 2.0.

**Outcome (Milestones 700–719):** met, with the manual passes listed in the acceptance evidence owed; see [Phase 31G acceptance evidence](../delivery/PHASE31G_ACCEPTANCE.md).

## Phase 31H — Android Shell and Durable Sync

**Status:** implemented in Milestones 720–728; final acceptance remains open. Decisions [PD-075–PD-083](DECISION_LOG.md#phase-31h-implementation-decisions) and [Phase 31H evidence](../delivery/PHASE31H_ACCEPTANCE.md) distinguish implementation from verified exit-gate results.

The Android workspace uses Expo 57.0.26, React Native 0.86.3, React 19.2.3, Hermes, JDK 17 and local prebuild/Gradle, supporting API 29 onward with compile/target API 36. Home, Tools, Search, Favorites and Settings share metadata/search, appearance tokens and stable codecs. The catalog opens details with availability explanations; executable tools remain 31I and the mobile binding map starts empty.

Native signing and pinned HTTPS/WebSocket adapters reuse the device protocol without desktop privileges. Hub category-filtered reads constrain Android to explicitly approved favorites/settings. Exclusive SQLite transactions protect edits plus outbox writes; claimed operations retain stable replay identities. Standalone, enrolled and archived data stay isolated. The Android driver synchronizes in the foreground and stages cursor recovery without dropping pending edits. Lifecycle actions expose credential-free recovery and confirmation-bound disconnect/cache/conversion paths.

| Milestone | Deliverable |
|---|---|
| 720 | Expo bootstrap, local builds and mobile boundaries |
| 721 | Shared native tokens and generated mobile binding discovery |
| 722 | Five-destination shell, catalog/search, appearance and navigation links |
| 723 | Native device identity, pinned transport and explicit enrollment |
| 724 | Category-filter contracts, Hub queries and API-client parity |
| 725 | Isolated SQLite repositories, migrations, atomic outbox and recovery storage |
| 726 | First-sync preview, foreground replay and cursor reconciliation |
| 727 | Revocation, disconnect/archive, category changes and restore/re-pair lifecycle |
| 728 | Preview packaging/CI, measurements, acceptance and documentation |

Local debug and disposable-key release APK/AAB builds passed; seven native security tests and two bundled Maestro journeys passed on each of API 29 and API 36. Local automated regressions are recorded in the acceptance evidence. Protected signing configuration, shipping artifact/install evidence, physical LAN/off-LAN/replay/re-pair, manual accessibility and first CI runs remain outstanding. Updated results belong in the acceptance record. Existing Windows, Hub and Pages/PWA release gates remain required. No Play publication, hosted builds, OTA channel, background worker or owner-admin mobile surface is added. Closing 31H permits 31I; the Android-inclusive DUDE 2.0 gate remains 31I.

## Historical V1 Definition of Done

DUDE V1 was declared done once all required items below were verified true, on 2026-09-19.

### Product

- [x] App is called DUDE.
- [x] Dark-only, highly colorful (bold accent palette), dense developer UI is implemented. *(V1 record. Since Phase 30K, Dark is the default theme alongside Light and the other first-party appearance options; see [Theme](../product/UX_SPEC.md#theme).)*
- [x] Category color-coding and semantic status colors ([Color System](../product/UX_SPEC.md#color-system)) are consistent across sidebar, deck, and tools. Verified: `src/styles/tokens.css` defines the palette once; sidebar/deck/command palette all derive category dots from `CATEGORY_METADATA` dynamically (no hard-coded colors per tool); `ErrorPanel`/`OfflineBadge` use the shared semantic tokens.
- [x] Deck exists.
- [x] Sidebar exists.
- [x] Global search exists.
- [x] Command palette exists.
- [x] Every MVP tool has a dedicated route.

### Architecture

- [x] Typed tool registry exists.
- [x] Shell is generated from tool metadata where practical. Verified: no shell file contains a hard-coded tool-id conditional (grepped `src/app/shell/`); sidebar, deck, command palette, and routes all iterate `TOOL_DEFINITIONS`/`ToolRegistryService`.
- [x] Per-tool persistence policy exists.
- [x] Shared worker execution path exists.
- [x] Online/offline state exists.
- [x] Tool failures do not disable shell navigation. Verified directly by `src/app/app.spec.ts`'s "a worker failure on a real tool does not break shell navigation" test.
- [x] Heavy tool routes are lazy-loaded.

### PWA

- [x] Manifest exists.
- [x] Service worker exists.
- [x] App is installable. Verified live at `https://arahman200165.github.io/DUDE/manifest.webmanifest` — valid `standalone` manifest with a full icon set (72–512px) plus an active service worker.
- [x] Shell works offline after first load.
- [x] Local-only tools remain usable offline.

### Deployment

- [x] Production build succeeds.
- [x] CI deployment works. Verified: latest `Deploy` GitHub Actions run for the Milestone 10 push completed successfully.
- [x] GitHub Pages site loads. Verified live: `https://arahman200165.github.io/DUDE/` returns HTTP 200.
- [x] Nested tool URLs work. Verified live and via `e2e/production-direct-route.spec.ts`.
- [x] Refresh on nested routes works. Same SPA-fallback mechanism, exercised by `e2e/pwa-offline.spec.ts`'s `page.reload()`.
- [x] Asset base path works. Verified live: `manifest.webmanifest` and `ngsw.json` both resolve correctly under the `/DUDE/` prefix.

### Tools

- [x] JSON Formatter / Validator
- [x] Regex Tester
- [x] Unix Timestamp Converter
- [x] Base64 Encoder / Decoder
- [x] Markdown Preview
- [x] JWT Debugger
- [x] Text Inspector
- [x] Hash Generator
- [x] Text Diff
- [x] UUID Generator / Inspector — shipped early as the extension-speed proof ([A. Extension speed](#a-extension-speed), [Initial Showcase Tool Set](#initial-showcase-tool-set)).

### Documentation

- [x] README exists. Rewritten to cover project purpose, screenshots, the full tools table, architecture summary, tech stack, and GitHub Pages deployment mechanics.
- [x] `ADDING_A_TOOL.md` exists.
- [x] architecture is understandable from repository structure and docs. Satisfied via `ADDING_A_TOOL.md`, the rewritten README's architecture section, and the self-descriptive `core/`/`shell/`/`shared/`/`tools/` layout.

### Validation

- [x] framework-critical tests pass. 176/176 via a fresh `npm test` run.
- [x] core navigation smoke test passes. `src/app/app.spec.ts` ("renders the deck at the root route") plus the command palette's navigate-on-Enter spec.
- [x] worker smoke test passes. `src/app/app.spec.ts`'s worker-failure-resilience test passes, and `WorkerClientService`'s full message contract is unit-tested. Note: no test currently drives a real browser `Worker` to a *successful* completion end-to-end (jsdom has no real `Worker`) — only failure-resilience and mocked-message-contract paths are covered.
- [x] offline smoke test passes. `e2e/pwa-offline.spec.ts`, fresh run.
- [x] direct-route production test passes. `e2e/production-direct-route.spec.ts`, fresh run, plus confirmed against the live deployed site.
- [x] a simple new tool can be added in ≤30 minutes without shell modifications. Verified via Milestone 10's timed UUID Generator / Inspector exercise: 2m50s, zero shell edits.
