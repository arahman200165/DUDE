# DUDE — Developer Utility Dashboard Engine

## Product Requirements Document

**Project name:** DUDE  
**Expanded name:** Developer Utility Dashboard Engine  
**Product type:** Desktop-first local developer workbench with a companion static web application  
**Primary deployment target:** Windows desktop application via Electron, GitHub Releases, and Microsoft Store packaging  
**Secondary deployment target:** GitHub Pages / installable PWA containing every DUDE capability that can run safely inside a browser sandbox  
**Primary frontend framework:** Angular  
**Primary audience:** The developer building and using it first; later, other developers  
**Delivery horizon:** Framework and first 10 tools delivered in one weekend; ongoing roadmap-driven development from there, now extending through a deliberately long-horizon Phase 100  
**Status:** V1 and Phases 1–29 shipped; Windows desktop packaging is real and shipped; Phases 30–100 remain roadmap/horizon work rather than a fixed schedule

---

# 1. Executive Summary

DUDE is a dense, colorful, local-first **desktop developer workbench** built with Angular and Electron, with a highly capable static web/PWA companion generated from the same shared core. The Windows desktop application is now the canonical product surface because DUDE has already shipped capabilities that a browser sandbox cannot reproduce: native filesystem access, OS-level secret storage, local backend processes, system integration, collaboration infrastructure, and future live networking/database/process tooling. The GitHub Pages build remains a permanent zero-install companion for every capability that can run safely in-browser.

Visually, DUDE remains dark-first today, but not monochrome or subdued. The current UI uses a dark base and a bright, bold, highly saturated accent-color system functionally — for categories, status, and structure — rather than decoratively. The current shipped theme remains the authoritative present-state design; Phase 30 later revisits light mode, theme customization, density, font, contrast, and accessibility options. See Section 8 for the full visual direction.

The original weekend project was **not** to build 20–30 tools immediately.

The weekend project was to build the **framework that makes tools 10 through 30 cheap and safe to add later**, while shipping enough varied tools to prove that the framework is sound. That framework was built, deployed, and proven, and the product has since grown far beyond the weekend scope.

The product is now:

- installable as a Windows desktop application through the Electron distribution track established in Phase 8;
- distributed through GitHub Releases today, with Microsoft Store/MSIX packaging support prepared by the shipped desktop release pipeline;
- backed by a local bundled backend only where native capabilities require one;
- static-hostable on GitHub Pages as a companion web build;
- installable as a PWA;
- functional offline for local-only/shared-core tools after the required assets are available;
- local-first by default;
- capable of public APIs, user-supplied API keys, local AI proxies, and later explicit integrations without making remote infrastructure mandatory;
- resilient so a heavy tool cannot freeze the whole application;
- bookmarkable through clean per-tool web URLs and, on desktop, addressable through `dude://` deep links (Phase 25);
- optimized today for Windows desktop plus desktop Chromium for the web companion;
- extremely dense and utility-first;
- easy to extend without changing the application shell;
- increasingly centered on workflows, workspaces, pipelines, Smart Paste, local history, and native integrations rather than raw tool count alone;
- governed by a shared-core rule: transformation and domain logic should remain platform-neutral whenever reasonably possible so desktop, web, CLI, IDE/browser extensions, tests, SDKs, and later integrations can reuse it.

The weekend MVP shipped with **9 showcase tools** chosen to exercise different UI, state, persistence, worker, parsing, formatting, and rendering patterns, plus a 10th tool (UUID Generator / Inspector) added as a timed extension-speed proof.

### 1.0.1 Product-positioning evolution record

The original V1 PRD correctly described DUDE at that time as a **static, single-page developer utility deck** whose primary deployment target was the GitHub Pages free tier. That historical description remains relevant to the V1 Definition of Done and the web companion, but it is no longer the correct description of the product as a whole after Phase 8. The previous wording that desktop was merely an additive wrapper or a conceptual “strict superset of the web PWA” is superseded: **DUDE Desktop is the canonical workbench; DUDE Web is the zero-install, browser-safe companion; both reuse the same core wherever platform constraints allow.**

## 1.1 Current Status

V1 is complete. The extensible framework, all core infrastructure from the original weekend scope (registry, persistence, workers, PWA, GitHub Pages routing/CI), and the 10 initial tools (the original 9 showcase tools plus the UUID Generator / Inspector) were built, tested, deployed, and verified live at `https://arahman200165.github.io/DUDE/`. Every item in the historical §35 V1 Definition of Done remains checked and verified against that deployment.

The product then continued through **Phases 1–21, all of which are complete**. Those phases expanded DUDE from the original showcase into hundreds of browser-capable tools, sandboxed execution, richer editors, structured/binary inspection, a shipped Windows Electron application, a local bundled backend, OS-level secure storage, AI regex assistance, local/self-hosted collaboration infrastructure, a universal I/O contract, transformation pipelines, user-defined sandboxed pipeline scripts, Smart Paste, persistent multi-tool workspaces, Saved Sessions, and persistent local history.

**Phase 8 (Downloadable Desktop App with a Bundled Backend) is complete** and is the turning point for the product hierarchy. Its eight shipped stages remain: Electron shell; native file access; OS-level secret storage; local LLM proxy + AI regex features; desktop shell chrome; local collab server; BYO relay server; auto-update + distribution. Those shipped details remain documented in §21 Phase 8.

**Phases 22–29 are also complete**: Phase 22 (Platform Hardening, Trust & Desktop-First Pivot) consolidated metadata/registry structure, trust, testing, and cache/bundle control; Phase 23 (Correctness, Verification & High-Consequence Tool Hardening) brought every one of the 277 tool manifests to a `verified` confidence tier; Phase 24 (Smart Entry, Discovery & Personal DUDE) turned Phase 21's Smart Paste/pipelines/workspaces/history into the primary paste-first, personalized entry experience — Recently Used, Favorites, Pinned Pipelines, Related-Tool and Pipeline Suggestions, Workspace Templates, Quick Run, and Unified Recents, all private-by-construction with no analytics or server telemetry; Phase 25 (Desktop-First Shell & Native Product Experience) finished that positioning change technically — Projects, a Desktop-Native Home, `dude://` deep links, a native OS menu, a six-source Command Palette, a Native File Recent List, crash/restart recovery, a Quick Launcher, native drag-and-drop routing, a generated file-association framework, Desktop Capability Indicators, desktop-first documentation, and a measured startup/parallelization pass — all shipped as Milestones 421–455. Phase 26 (Web Companion & PWA Efficiency) added selective offline readiness, install/share/handoff flows, browser-safe pipeline and workspace support, and web/desktop parity tests, shipped as Milestones 482–488. Phase 27 (Networking Toolkit) began the native expansion. It shipped 18 desktop network-diagnostics tools over a main-process-enforced IPC bridge and a bundled Windows ICMP helper, as Milestones 489–508. Phase 28 shipped live DNS, TLS and certificate inspection as Milestones 509–522. Phase 29 shipped filesystem scanning, watching and previewed mutation as Milestones 523–536.

The roadmap is now one linear product horizon through **Phase 100**. Completed Phases 22–26 consolidated platform structure, trust, discovery, desktop UX, and web/PWA efficiency. Phases 27–38 form the next major product expansion: Phases 27–29 shipped networking, live DNS/TLS and filesystem workflows, and Phases 30–38 continue across theming and accessibility, Windows/process tooling, local API/server development, live databases, containers, OS integration, AI-assisted utilities, VS Code integration, and browser-extension integration. Later phases extend into cross-platform desktop, automation, Git/SSH/package/build/log/proxy/database/container/Kubernetes workflows, secrets/PKI, collaboration/workspaces/pipelines, plugins/extensions, CLI/SDK/headless automation, AI, project/code/runtime tooling, and a deliberately distant platform/ecosystem horizon.

---

# 2. Core Product Goal

Build a reusable developer utility platform where adding a new simple utility is routine instead of architectural work.

The most important outcome is not raw tool count.

The most important outcome is this:

> After the framework exists, a new simple utility whose core logic already exists should be addable in 30 minutes or less without modifying the application shell.

This makes DUDE a long-lived personal utility platform rather than a one-weekend collection of unrelated components.

---

# 3. Historical V1 Success Criteria and Continuing Principles

The weekend project was judged successful once all of the following were true. These criteria are the **historical V1 baseline**, not the complete modern quality contract for the product DUDE has since become. Their underlying principles — extension speed, deployment reliability, performance/isolation, architecture clarity, and predictable recovery — continue to apply, but later capabilities may and often must carry stricter capability-specific requirements.

The current product contract therefore layers the canonical Windows desktop application, shared-core web/desktop parity, native-security boundaries, platform/capability disclosure, and the stronger structural/correctness/release gates introduced from Phases 22–23 onward on top of this V1 baseline. Nothing in this section limits a later phase from establishing a higher bar for cryptography, authentication, native mutation, filesystem/process/database writes, network interception, code execution, plugins, automation, remote execution, or other high-consequence capabilities.

## 3.1 Hard pass/fail criteria

### A. Extension speed

A new simple tool with existing transformation logic can be added in **30 minutes or less**.

**Achieved:** the UUID Generator / Inspector (§21 Phase 1 #12) was added, registered, and verified end-to-end in 2 minutes 50 seconds with zero shell/core edits — well inside the target.

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

### B. Deployment reliability

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

---

## 3.2 Strong targets

### C. Performance and isolation

- The shell should remain responsive during expensive work.
- Heavy or potentially blocking tasks can opt into a reusable worker execution layer.
- Worker-backed tasks must support cancellation where practical.
- Heavy tools should be lazy-loaded.
- A broken or computationally expensive tool should not take down navigation for the whole deck.

No strict bundle-size target is required.

The project deliberately prioritizes shipping and library reuse over extreme bundle minimization.

### D. Architecture clarity

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

---

# 4. Product Principles

## 4.1 Framework first

The first weekend optimized for extensibility before tool count.

This ordering was validated by the actual delivery sequence: shell → tool registry → command palette → persistence policies → worker execution layer → PWA/connectivity → GitHub Pages routing/CI → showcase tools → critical tests → extension-speed proof. Each layer was built before the tools that depend on it, which is why the 10th tool (§3.1.A) could be added in under three minutes with no shell changes.

## 4.2 Local first

If a capability can run entirely on the user's machine, it should. If the same capability can run safely inside a browser sandbox, the shared implementation should remain browser-capable as well.

The original rule — **“if a tool can run entirely in the browser, it should”** — still governs the web companion. The desktop-first pivot does not justify moving deterministic browser-safe work into a backend merely because Electron makes that convenient. Desktop-native services exist for capabilities the browser cannot provide: raw sockets, arbitrary/background filesystem access, processes, OS integration, local servers, secure keychain access, and similar native operations.

Network access should not be introduced merely because it is convenient. Any transmission outside the machine must be explicit in capability metadata and visible to the user.

This is also a product feature, not just an architecture choice: DUDE should make it visible in the UI when a tool is processing entirely on-device — “processed locally, your data never leaves your machine” — since this matters most for exactly the inputs users are most guarded about (JWTs, API responses, logs, configs, company data). See §14, §30, §31, and the Phase 22 metadata/security work for how this is enforced technically.

---

## 4.3 Dense over decorative

DUDE is a working developer surface, not a marketing site.

Screen real estate should be spent on inputs, outputs, useful controls, status, and metadata.

This applies to color the same way it applies to space: the palette is bright and bold (Section 8), but every color is carrying information — category, status, active state — never spent purely for decoration.

## 4.4 Fast and predictable

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

## 4.5 Explicit over magical

Persistence, API usage, sensitive-value storage, worker execution, and online requirements should be visible in the implementation and preferably declared by the tool.

## 4.6 Failure should remain local

A failing tool should fail inside its own workspace.

The application shell should survive.

## 4.7 Expansion is roadmap-driven

The roadmap can be broad (§21).

Any single unit of work — a new tool, an enhancement, a framework change — should still be scoped and finished on its own terms rather than growing to cover multiple roadmap items at once.

## 4.8 Depth and interconnection over raw tool count

DUDE's moat is not the number of tools it has.

As the roadmap grows into the hundreds of tools (§21), the differentiator is meant to stay excellent UX, privacy, interoperability between tools, and depth on the tools that already exist — not simply adding more of them. Concretely: prefer enriching an existing tool (tree views, search, exports, validation, related-tool hand-offs) over shipping a shallow new one when both are on the table, and treat DUDE as a single cohesive workbench that tools connect within (see §21 Phase 21), not an unrelated pile of pages that happen to share a shell.

## 4.9 Desktop is canonical; web preserves zero-install reach

The Windows desktop application is the canonical, complete DUDE workbench. The GitHub Pages/PWA build remains a permanent, zero-install companion and should contain **every DUDE capability that can run safely inside a browser sandbox**, but web-platform constraints no longer define the ceiling of the product.

Desktop is not conceptually defined as “the web app plus a few extra permissions.” It is the primary product surface for native workflows: OS/network/filesystem/process access, drag-and-drop, system tray and global shortcuts, local servers, live database connections, native file watching, secure keychain storage, multi-window workflows, desktop automation, and later integrations that cannot be reproduced faithfully in a browser.

This still implies a strict shared-core architecture. Transformation/domain logic should live in platform-neutral modules whenever reasonably possible, with thin adapters for Angular/browser APIs, Electron/native APIs, CLI, VS Code/IDE integrations, browser extensions, tests, SDKs, and future surfaces. The desktop and web builds must not fork the same deterministic tool logic into unrelated implementations.

The web companion remains strategically important because a URL is the lowest-friction entry point into DUDE: no install, bookmarkable tool routes, PWA support, offline-safe local utilities, and easy sharing of tool locations. Phase 26 hardened that companion with selective offline caching, share links, PWA installation, and navigation-only desktop handoff.

Basic local developer utilities must never be paywalled behind the desktop app, an account, or a paid tier. They are the product's on-ramp, not an upsell surface.

---

# 5. Product Scope Boundaries

## 5.1 In Scope (V1 — Delivered)

The weekend implementation delivered:

- Angular application foundation;
- dense dark-only UI shell;
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

---

## 5.2 Durable Product Boundaries

§5.2 now separates genuine durable principles from features that were merely premature. Desktop packaging, collaboration, multi-window workflows, snippets, secrets, extensions, and theming demonstrated that many weekend-era exclusions were really “not yet,” not “never.” The authoritative scope is therefore a smaller set of durable constraints.

These constraints survive roadmap growth unless the owner makes an explicit future PRD decision to reverse one:

1. **No silent transmission of user data.** Any feature that sends user input, files, secrets, logs, code, telemetry, or derived content off-machine must disclose that behavior and require an appropriate explicit action/opt-in.
2. **No mandatory cloud dependency for functionality that can reasonably stay local.** Deterministic utilities, local workspaces, local history, local automation, and other local-capable workflows must remain useful without a hosted account/service.
3. **No DUDE-operated hosted cloud is part of the current product direction.** Local bundled backends, LAN services, BYO/self-hosted relays, user-owned remote machines/runners, and self-hosted/on-prem infrastructure are allowed. Roadmap phases that describe optional DUDE-hosted accounts/sync/collaboration/compute are retained for completeness as a *conditional alternative horizon*, but they are not authorized while this boundary stands.
4. **No destructive or privileged operation without explicit confirmation.** Opening, importing, inspecting, or detecting data must never itself trigger destructive system changes. Mutating process/registry/service/filesystem/database/container/Kubernetes/remote-system operations require clear intent, previews/dry runs where practical, and confirmation proportional to risk.
5. **No untrusted remote code executing with DUDE/Desktop privileges.** Sandboxed user scripts and future plugins/extensions may exist, but untrusted code must be isolated/capability-scoped. Native privileges may only be granted through explicit, reviewable permission boundaries.
6. **No private credentials compiled into distributions.** Service credentials are user-supplied, locally generated, retrieved from approved local secret stores, or configured by the operator of a self-hosted deployment.
7. **Basic local developer utilities never become paywalled.** A future commercial model may charge for optional services or advanced organizational capabilities, but must not remove or artificially cripple formerly-local utility functionality to manufacture a paid tier.
8. **DUDE does not become a conventional VS Code clone or source-code-IDE-first product.** Later editor, LSP, terminal, Git, project, and code-intelligence surfaces are allowed only in service of the broader developer-workbench model. The product identity remains “give this development problem/artifact/system to DUDE,” not “rebuild VS Code feature-for-feature.”

## 5.2.1 Destructive-Action Contract

Durable constraint #4 above is a principle; this is the concrete contract every `filesystem-write`, `process-management`, `registry`, or `database-write` tool must implement. Phase 29 is the first local implementation, through the filesystem mutation engine (§21 Phase 29); later native write capabilities must meet the same boundary:

1. **Two-step confirmation.** A mutating action always has a distinct preview/dry-run step (what will change) and a separate, explicit confirm step (do it) — never a single click/keystroke that both previews and commits.
2. **No incidental triggering.** Opening a file, importing data, running a detector, or otherwise inspecting input must never itself cause the destructive effect — the mutating action must be its own deliberate user gesture, reachable only after the preview step.
3. **Consequence tagging.** The tool's manifest declares the relevant `ConsequenceClass` (`src/app/shared/models/tool-definition.model.ts`) so it's covered by the generated High-Consequence Tool Matrix (`SECURITY.md`) and any capability-specific release gate.
4. **A confirmation-boundary test.** The tool's own spec asserts the destructive effect cannot fire without going through both steps above — this is the "Destructive-Action Harness" (Phase 23 Item 8) in practice: enforced per-tool at the point each such tool ships, not as a separate suite run against nothing.

Phase 27 applied the same shape to its non-local high-consequence checks. A `network-scanning` or `remote-write` run first gets a main-process preview. It then needs a single-use confirmation token, bound to the requesting window and the unchanged request, which expires after 60 seconds. `electron/network-bridge.spec.ts` covers that boundary, including an attempted renderer-side limit bypass. Phase 29's filesystem mutation engine is the first local implementation: it previews exact paths and preconditions, issues a 60-second single-use token bound to the requesting window and plan digest, rechecks files at apply time, journals per-operation results and supports previewed undo. Trash operations use the Recycle Bin. Engine and tool confirmation-boundary tests cover token replay, conflicts and the no-incidental-trigger rule.

## 5.3 Historical Exclusions Now Treated as Roadmap Territory

The original exclusions are preserved here so none of their rationale disappears. Their status changes from “permanently impossible” to one of: shipped, proposed, conditionally gated, or unscheduled.

- **User accounts** — no longer philosophically impossible, but any DUDE-hosted identity is conditional and gated by the no-DUDE-hosted-cloud boundary; the source suggestion is retained as Phase 81.
- **Cloud synchronization / multi-device preferences** — conditional Phase 82–83 concepts; local-only mode must remain first-class, and current no-hosted-cloud direction means self-hosted/user-owned alternatives are the viable path unless explicitly reversed.
- **Custom backend** — a *local bundled backend* shipped in Phase 8. A mandatory remote/cloud backend remains disallowed; self-hosted/on-prem backends are allowed later.
- **DUDE-operated product database** — still unnecessary for the local product. This does not block Phase 33/48 tools connecting to user databases or future self-hosted platform infrastructure.
- **Telemetry platform / analytics dashboard** — not silently enabled. Phase 93 preserves the idea only as explicit opt-in diagnostics/product insights with payload transparency and no user-payload collection.
- **Collaborative editing** — already partially reopened and shipped through same-machine/LAN collaboration plus a BYO relay in Phase 8. Phase 53 expands self-hosted/accountless collaboration; Phase 84's DUDE-hosted service is conditional and blocked while the current hosted-cloud boundary stands.
- **DUDE-operated hosted snippet service** — a user-operated/self-hosted snippet-sharing service is in Phase 32; a DUDE-hosted service is not part of the current direction.
- **Extension marketplace / plugin installation from remote sources** — Phase 56 introduces a Local Plugin SDK; Phase 57 proposes signed, permission-declared extensions. Remote extension code must never become arbitrary native-code execution. A DUDE-hosted marketplace backend remains conditional; local/self-hosted catalogs are compatible with the current boundary.
- **Third-party authentication** — only relevant to distant team/enterprise or source-hosting integrations; any hosted identity use is conditional.
- **Mobile-first layout** — still not the core UX. Phase 91 preserves a mobile *companion* concept rather than redesigning the full workbench around a phone.
- **Firefox-specific / Safari-specific optimization** — moved to distant Phase 92 Universal Web Platform rather than being permanently excluded.
- **Monaco-style full IDE workspace** — the literal permanent exclusion is retired, but replaced by the stronger identity boundary in §5.2: Phase 77–80 may add editor/LSP/terminal/project surfaces without turning DUDE into a conventional IDE clone.
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

### 5.3.1 Historical amendments preserved

These three amendments are reproduced verbatim from the pre-2026-09-25 PRD (only inline `§21 Phase N` pointers are updated, to the phase's current number after the roadmap renumbering — the wording, bullet structure, and terminology in use at the time, including "Track A"/"Track B", are otherwise untouched). Each is followed by a dated **Superseded** note stating explicitly which specific claims this rewrite has since changed, so the historical record stays legible without silently contradicting the current doc.

**Amendment (2026-09-20):** Electron/Tauri/native desktop packaging is **no longer a permanent non-goal**. §21 (the Roadmap's Phase 8 and its Track B rationale) adopts desktop packaging as a real future direction, since a large class of genuinely useful tools (§21, Track B) needs native OS/network/filesystem access a browser tab cannot get. This is a narrow, deliberate carve-out, not a general reopening of the list above:

- a desktop build's **local, bundled backend** — used only to give Track B tools OS/network/filesystem access on the user's own machine — is now in scope;
- a **cloud-hosted** backend, a DUDE-operated database, user accounts, and cloud sync remain permanent non-goals for the product as a whole, desktop included, unless a future decision explicitly revisits them (Appendix D §D.1 flags this exact tension and does not resolve it);
- the web/GitHub Pages build remains the permanent zero-install default (§4.9) — desktop is additive, not a replacement.

**Superseded 2026-09-25:** the third bullet's "desktop is additive, not a replacement" is reversed by the current §4.9 — desktop is now the canonical workbench and the web/GitHub Pages build is the zero-install companion, not the default. The first two bullets' substance still stands: the local bundled backend remains in scope, and a cloud-hosted backend/database/accounts/sync remain outside the current product direction, now stated as durable boundaries in §5.2 and tracked as conditional roadmap territory in §5.3.

**Amendment (2026-09-20):** "collaborative editing" above is narrowed by the same carve-out, not reopened wholesale. §21 Phase 8 Stages 6–7 ship real-time collaborative editing for Advanced Markdown Workspace, entirely within the scope the desktop-packaging amendment already grants:

- a same-machine/LAN local collab server (Stage 6) and a user's own self-hosted relay (Stage 7, `relay/`, BYO — never a DUDE-run service) are in scope, because both are either the desktop build's local, bundled backend or infrastructure the user stands up themselves;
- a DUDE-operated, cloud-hosted collaboration service — hosted rooms, accounts, server-stored documents — remains a permanent non-goal, unchanged from the list above;
- the web/GitHub Pages build has no collaboration feature and isn't gaining one — this is desktop-only, additive, consistent with §4.9.

**Superseded 2026-09-25:** the closing "consistent with §4.9" reads differently under the current §4.9 (desktop is canonical, not merely additive), though the underlying fact is unchanged — collaboration is still desktop-only and the web build still has none. The second bullet's "permanent non-goal" is restated as conditional, gated territory at §5.3 (Phase 84, DUDE-hosted collaboration), not reopened.

**Amendment (2026-09-21):** the product has grown well past the original weekend MVP this list was written to protect, and several further items are revisited — each a narrow, deliberate carve-out, not a reopening of anything else on the list:

- **multi-tool tabs, resizable workbench panels, user-defined tool scripting** are no longer permanent non-goals — see §21 Phase 21, whose ceiling is explicitly "a multi-tool workbench, not a source-code IDE." Draggable panel rearrangement and a Monaco-style full IDE remain out of scope, unchanged above.
- **multi-window workflows** is no longer a permanent non-goal — see §21 Phase 35. This is OS/window-management territory, distinct from Phase 21's single-window workbench above.
- **"shareable server-stored snippets"** is narrowed, not removed — reworded above to **"DUDE-operated hosted snippet service"**, since a self-hosted/BYO snippet-sharing service is now in scope (§21 Phase 32), on the same BYO-deployment precedent as collaborative editing above; a DUDE-run one remains out of scope.
- **"secret storage service"** is narrowed, not removed — reworded above to **"cloud-hosted secret storage service"**, since a local-only secrets vault built on the desktop track's `secure-local`/OS-keychain tier is now in scope (§21 Phase 35, with deeper work in Phase 51); a cloud-hosted one remains out of scope.
- **VS Code extension, browser extension packaging** are no longer permanent non-goals — see §21 Phase 37 and Phase 38, both distribution/integration targets needing their own scoping pass.
- **theme customization, light mode** are no longer permanent non-goals — see §21 Phase 30. This reverses an explicit, still-current design decision (§8.1, §8.5, `AGENTS.md`, Appendix A Q12) that will need its own amendments if and when that phase is actually adopted; nothing about those living specs changes now.
- localization/i18n was also considered and is **not** revisited — it stays a permanent non-goal, unchanged above.

**Superseded 2026-09-25:** two of the seven bullets above no longer hold as written. §8.1 is itself amended by this rewrite — theme customization/light mode is no longer described elsewhere in the doc as "an explicit, still-current design decision," so that bullet's closing "nothing about those living specs changes now" is no longer accurate; see the current §8.1 and Appendix A Q12 directly. Localization/i18n's "stays a permanent non-goal, unchanged" is also reversed — §5.3 now retains it as a distant, unscheduled Phase 94 possibility rather than a permanent exclusion. The other carve-outs and their stated ceilings (multi-tool workbench not an IDE; Monaco-style IDE and draggable panels out of scope; BYO-only snippet/secrets deployment) remain the current, accurate boundary. `AGENTS.md`'s top-of-file product description has also been updated as part of this rewrite to describe desktop-canonical/web-companion positioning instead of the old "static PWA deployed to GitHub Pages" framing, so it no longer contradicts this section; its dark-mode-only line is unaffected until Phase 30 actually ships.

## 5.4 Deferred / Roadmap-Tracked Scope

These items are not failures of the original product and are handled by the roadmap:

- WYSIWYG rich-text editor (§21 Phase 5, #36) — ✅ shipped.
- Executable JavaScript playground, arbitrary HTML execution, arbitrary template execution, and sandboxed code runner (Phase 6) — ✅ shipped; see the amended standing security rule at §31.
- Cross-tool I/O, pipelines, Smart Paste, workspace/Saved Sessions, and local history (Phase 21) — ✅ shipped.
- Platform hardening/correctness/discovery/desktop shell/web efficiency (Phases 22–26) — completed consolidation wave.
- Native network diagnostics (Phase 27) — ✅ shipped.
- TLS, filesystem, theming, Windows/process, API/server, database, container, OS-integration, AI, and editor/browser integration work is tracked authoritatively in Phases 28–38. TLS and filesystem expansion shipped in Phases 28–29; theming through browser-integration work remains tracked in Phases 30–38.
- Long-horizon additions through Phase 100 are roadmap directions, not a fixed commitment or schedule.

---

# 6. Target User

## 6.1 Primary user

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

## 6.2 Usage pattern

The expected use pattern is short and frequent:

1. open DUDE;
2. reach the desired tool quickly;
3. paste/type data;
4. get the result immediately;
5. copy the result;
6. switch tools or leave.

The application should optimize for repeated daily use rather than onboarding first-time nontechnical users.

---

# 7. Supported Platform

## 7.1 Primary Supported Platform

- **Windows desktop application via Electron** — the canonical DUDE product surface.
- Distribution through the shipped GitHub Releases installer/update path, with MSIX/Microsoft Store packaging support as established by Phase 8 Stage 8.
- Local/offline operation where the selected capability permits it.
- Native capability through sandboxed preload/IPC boundaries rather than direct Node access in the renderer.

Acceptance for new native features is primarily against the Windows desktop product unless a phase explicitly targets another platform.

## 7.2 Secondary Supported Platform — Web Companion

- Desktop Chromium-based browsers.
- GitHub Pages free-tier static hosting.
- Installable PWA behavior.
- Online and offline operation where applicable.
- Every shared capability that can run safely within browser constraints should remain available here rather than being made desktop-only without a technical reason.

## 7.3 Not Currently Required / Future Roadmap

The application should not intentionally break elsewhere, but current acceptance does not require:

- Firefox parity — revisited in Phase 92;
- Safari parity — revisited in Phase 92;
- mobile optimization — a mobile companion appears only at Phase 91 and is not a mobile-first redesign;
- touch-first interactions — revisited as part of later universal-web work;
- narrow-screen layout quality — likewise later universal-web work;
- macOS desktop parity — Phase 39;
- Linux desktop parity — Phase 39.

Windows remains the desktop reference platform even if Phase 39 later makes desktop cross-platform.

---

# 8. Visual Direction

## 8.1 Theme

**Current shipped state:** dark mode only, with no light-theme toggle.

The dark theme is not muted or monochrome. DUDE currently uses a single, fixed, highly colorful theme: a dark base (background/panel surfaces) paired with a bright, bold, highly saturated accent-color palette used throughout the shell and every tool. Color is a primary structural and functional device, not an afterthought layered on top of a gray UI.

This remains the authoritative present-state theme until a theming phase is actually implemented. It is no longer a permanent product prohibition: Phase 30 explicitly revisits light mode, theme customization, accent palettes, density, fonts, reduced motion, high contrast, color-blind-safe semantics, and theme import/export.

## 8.2 Density

Extremely dense.

The interface should favor:

- small control heights;
- compact spacing;
- compact typography;
- high information density;
- minimal empty decorative space;
- restrained border *weight* and panel chrome — structure and separation are carried primarily by bold color and contrast rather than heavy borders, drop shadows, or extra whitespace;
- compact status indicators, rendered in bold semantic color rather than muted gray;
- compact headers.

Density and color intensity are complementary, not in tension: strong, bold color lets compact panels, tight status chips, and small controls stay legible and instantly scannable without needing extra size or spacing to read clearly.

## 8.3 Style

Developer console / workstation utility — a colorful, high-contrast terminal/IDE aesthetic, not a muted enterprise dashboard.

Color is used functionally and boldly:

- category color-coding (Section 12.3);
- semantic status colors (error, warning, success, info, running/busy, offline);
- syntax highlighting and structured-data coloring;
- bold accent colors on interactive elements (active nav item, focus states, primary actions, links);
- bright, saturated badges and indicators that are immediately scannable at a glance.

Still avoid, regardless of color intensity:

- oversized marketing cards;
- large hero headers;
- decorative gradients used purely for polish (a gradient used as a meaningful status/progress indicator is fine; a gradient used as visual flourish is not);
- glow/neon shadow effects;
- excessive rounded cards;
- giant empty margins;
- onboarding illustrations;
- ornamental animations.

The rule of thumb: color should always be carrying information (what category, what state, what severity, what's active) — never decoration for its own sake.

## 8.4 Typography

Use monospace selectively for:

- input/output data;
- code-like values;
- timestamps;
- hashes;
- tokens;
- regex;
- structured data.

Navigation and labels may use a compact UI font.

## 8.5 Color System

A single fixed dark-and-colorful palette is defined once and shared by the shell and every tool through the design-token/theming layer (Section 23, `shared/`).

Required elements:

- a dark base scale (background, panel, elevated-panel, border) that all tools and shell chrome share;
- a bright, bold accent palette with enough distinct hues to color-code all Section 12.3 categories without repeats;
- fixed semantic colors for error, warning, success, info, and busy/running states, used consistently by the shared error panel, warning badge, loading indicator, and offline badge (Section 13);
- a defined active/focus accent used consistently across sidebar selection, command palette selection, and primary buttons;
- monospace/data regions (Section 8.4) styled with enough contrast and, where applicable, syntax coloring to stay readable against the dark base.

Constraints:

- exactly one theme is defined in the **current shipped implementation**; Phase 30 may introduce controlled user configuration without invalidating the historical V1 design;
- every color combination used for text or status meaning must still meet the contrast baseline in Section 19 — "bright and bold" must not come at the cost of legibility;
- new tools reuse the shared palette/tokens rather than inventing tool-specific colors, so the deck and sidebar stay visually coherent as tools are added.

---

# 9. Navigation and Information Architecture

The selected model is a hybrid.

## 9.1 Deck home

The Phase 30D default Home is planned as a bounded, action-first workbench surface. It prioritizes Smart Entry, personalized tool launch, resuming projects/workspaces/pipelines, and Quick Run. Local activity summaries and a compact catalog preview may appear without making the complete registry Home's dominant content. Phase 30I specifies the user-designed Home layout builder. In the Phase 30 design, the exhaustive registry belongs to Browse Tools; category navigation, search, and the Command Palette provide other discovery paths.

For the original V1 deck, a tool list/grid with all registered tools was required while recent and favorite tools were optional. That remains the historical V1 acceptance record; Phase 24 made personalization first-class, and the Phase 30D default Home replaces that V1 layout when implemented.

## 9.2 Sidebar

The Phase 30B target is a persistent desktop sidebar containing:

- DUDE identity;
- global search/command launcher;
- primary shell destinations;
- registry-derived category links/counts into Browse Tools;
- a Browse Tools entry point;
- active route state.

The redesigned sidebar should be compact enough to remain open during normal use. Individual tool links may appear through explicit category expansion, but the complete registry is not permanently expanded by default.

## 9.3 Command palette

Keyboard-accessible global launcher.

Recommended shortcut:

- `Ctrl+K` on the primary target platform.

Capabilities for V1:

- search by tool title;
- search by keyword;
- search by category;
- navigate directly to tool.

Deferred:

- executing tool actions directly from palette;
- command history;
- fuzzy action chains;
- extension commands.

## 9.4 Dedicated tool routes

Every tool receives its own bookmarkable route.

Example shape:

```text
/tools/json
/tools/regex
/tools/timestamp
```

The exact route convention may change during implementation, but all tools must have stable dedicated URLs.

---

# 10. Web Companion / GitHub Pages Routing Strategy

The web companion keeps clean, bookmarkable routes with a GitHub Pages SPA fallback. These requirements apply to the secondary web/PWA surface even though desktop is now canonical.

Requirements:

- Angular router with clean routes;
- repository-aware base path;
- deployment output suitable for GitHub Pages;
- generated/copied `404.html` fallback;
- fallback script/strategy that restores the intended SPA route;
- direct refresh on a tool URL works;
- back/forward browser navigation works;
- PWA service worker does not break route recovery;
- desktop-only tools/routes degrade to a clear explanatory capability state rather than a broken page;
- shareable web routes remain stable wherever the underlying capability is browser-safe;
- browser-to-desktop handoff through `dude://` or another explicit protocol must enhance, not replace, the corresponding web route — a browser-safe route must remain independently usable when its capability exists on the web companion.

Hash routing is explicitly not the chosen approach.

---

# 11. Web Companion PWA and Offline Model

The web companion is installable as a PWA. Desktop installation is handled separately by the Electron distribution path; this section governs only browser/PWA behavior.

## 11.1 Required PWA Behavior

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

## 11.2 Network-dependent tools

Future tools may depend on public APIs.

Such tools must:

- clearly declare that network access is required;
- identify the external service, user-directed endpoint, local proxy, or user-owned infrastructure involved where practical;
- not break the rest of the app offline;
- display a compact offline state;
- degrade gracefully;
- avoid blocking application startup;
- keep network, persistence, platform/native-capability, and external-data-boundary metadata available to the shared shell so disclosure UI can explain **what will leave the machine, where it goes, and which platform capability is being used** before or while the action runs.

## 11.3 API-key tools

User-supplied API keys are allowed.

Rules:

- no private API key may be compiled into DUDE;
- session-only storage is the browser default;
- persistent browser storage requires explicit user opt-in and is appropriate only for integrations/payloads whose sensitivity permits it;
- desktop secrets should use the applicable `secure-local` / OS-keychain-backed credential tier when persistence is requested and available;
- **never downgrade a secret into ordinary local storage merely for implementation convenience**; if the secure storage path cannot satisfy a requirement, the feature must stay session-only/nonpersistent or receive an explicit architecture change rather than silently weakening the credential boundary;
- API-key storage is handled through shared credential/persistence abstractions rather than ad hoc tool code;
- API-backed tools should isolate key usage to the specific integration;
- the app should make it clear when a tool sends data to an external service.

---

# 12. Tool Architecture

The architecture should be moderately structured rather than rigidly uniform.

Tools should share a common contract where useful, while retaining freedom for different UI patterns.

## 12.1 Tool metadata

Each tool should define metadata equivalent to:

```ts
interface ToolDefinition {
  id: string;
  title: string;
  shortTitle?: string;
  description: string;
  category: ToolCategory;
  keywords: string[];
  route: string;
  icon?: string;
  load: () => Promise<unknown>;
  persistence?: ToolPersistencePolicy;
  execution?: ToolExecutionPolicy;
  network?: ToolNetworkPolicy;
  status?: 'experimental' | 'stable' | 'verified';
  io: ToolIOCapabilities;
  capabilities?: readonly ToolCapability[];
  pwaShortcut?: { order: number };
  documentation?: ToolDocumentationMetadata;
}
```

This abbreviated shape reflects the shipped manifest contract. `io` is required; `capabilities` uses the closed platform/runtime vocabulary from Phase 26, replacing the former `desktopCapabilities` strings and the conceptual `platforms` field. `pwaShortcut` feeds the generated web manifest. Other fields (verification, file input, settings, consequence class, and desktop opening) live in `tool-definition.model.ts`. Each tool owns one colocated manifest; registry, routes, ToolShell, generated documentation, and discovery read that definition.

## 12.2 Registry responsibilities

The registry should drive:

- sidebar navigation;
- deck discovery;
- global search;
- command palette;
- route metadata where practical;
- category grouping;
- tool status;
- persistence declarations;
- online/offline hints;
- desktop/web availability and capability indicators;
- network/external-service disclosure metadata;
- shell-visible privacy/native-capability disclosures so the shared UI does not depend on tool-local hard-coded warnings.

The shell must not contain hard-coded conditionals for individual tools.

## 12.3 Tool categories

Initial category taxonomy:

- Data
- Text
- Encoding
- Security
- Date & Time
- Web
- Developer
- Documents

Avoid creating too many categories in the MVP.

Taxonomy can evolve later.

Each category is assigned one fixed bold accent color from the shared palette (Section 8.5), used consistently for that category's sidebar group, deck section, and tool badges. Category color is metadata-driven from the registry, not hard-coded per tool.

---

# 13. Shared Tool Shell

Each tool route should render inside a shared workspace frame.

Recommended structure:

```text
Tool title / compact metadata / status
Primary controls
-------------------------------------
Input / working area
-------------------------------------
Output / preview / result
-------------------------------------
Compact action/status footer if needed
```

Not every tool must use the same visual arrangement.

The shared shell should provide reusable affordances, not force every tool into identical form fields.

Possible shared pieces:

- copy button;
- clear/reset button;
- swap button;
- run button;
- input/output headers;
- error panel;
- warning badge;
- loading indicator;
- offline badge;
- worker-running indicator;
- byte/character metadata;
- reusable split pane.

---

# 14. State and Persistence Model

Selected policy:

> Per-tool choice, with selective persistence as the default.

Each tool should declare one of the following:

- `none`: never persist;
- `session`: survive navigation and possibly refresh within session semantics;
- `local`: persist locally across sessions;
- `user-choice`: allow explicit opt-in.

## 14.1 Default policy

Safe tool preferences may persist.

Potentially sensitive payloads should not persist automatically.

Examples of values that may persist:

- preferred indentation size;
- selected timestamp unit;
- regex flags;
- layout preference;
- selected hash algorithm.

Examples that should default to nonpersistent/session-only:

- JWT values;
- API keys;
- pasted headers;
- private JSON;
- large arbitrary text blobs;
- tokens.

The architecture should permit a tool to choose differently when justified.

---

# 15. Worker Execution Layer

A reusable worker abstraction is required.

The purpose is not to move every task off the main thread.

The purpose is to make off-main-thread execution easy for tools that need it.

## 15.1 Worker layer responsibilities

Where practical:

- submit task;
- receive progress/status if needed;
- receive result;
- receive typed error;
- cancel task;
- terminate/restart worker;
- avoid leaking state between unrelated jobs.

## 15.2 Candidate worker-backed operations

- large JSON parsing/formatting;
- expensive regex testing;
- large diffs;
- hashing;
- large encoding/decoding;
- future compression/decompression;
- future CSV transformation.

## 15.3 Scope Limit

Build one reusable abstraction and use it in enough showcase tools to prove it.

Do not build a generalized distributed job system.

Do not build a worker pool unless the implementation is trivial.

---

# 16. Error and Failure Isolation

Failure isolation is mandatory.

## 16.1 Requirements

A tool-level error should not leave the app unusable.

At minimum:

- parsing errors stay inside the tool;
- rejected worker jobs stay inside the tool;
- failed API calls stay inside the tool;
- the sidebar remains functional;
- route navigation remains functional.

## 16.2 Recovery

Tools should offer simple recovery where useful:

- clear;
- reset;
- retry;
- cancel;
- return to deck.

The original V1 did not require an elaborate crash-reporting platform, and crash reporting remains nonessential to the local utility baseline. Any later diagnostics/telemetry capability must remain opt-in, privacy-explicit, and consistent with the no-silent-transmission boundary; Phase 93 is a conditional long-horizon proposal rather than a retroactive V1 requirement.

---

# 17. Dependency Philosophy

The project is library-forward.

Use mature third-party libraries where they materially reduce implementation effort or increase correctness.

Examples of acceptable library use:

- Markdown parsing/rendering;
- diffing;
- regex utilities;
- JWT parsing;
- syntax highlighting;
- formatting/parsing;
- UUID generation;
- hashing where browser-native APIs are insufficient;
- PWA helpers already natural to Angular.

## 17.1 Dependency rule

A dependency is acceptable when:

- it solves a real problem;
- it runs on every platform where the capability is declared available, with browser-compatible dependencies required for web-companion/shared-core paths;
- it does not introduce a mandatory remote server or hosted-cloud dependency for functionality that can reasonably remain local; local bundled services, user-controlled self-hosted services, and capability-specific native dependencies are allowed where the roadmap explicitly calls for them;
- it is reasonably maintained;
- it does not introduce a fundamentally conflicting architecture.

**Historical V1 rule preserved:** when DUDE was browser-first, this was expressed more narrowly as “it works in the browser” and “it does not require a server.” The desktop-first product keeps the intent—portable, local-first dependencies—while allowing native and local-service dependencies for capabilities the browser cannot provide.

## 17.2 Not a Priority

Do not spend time rewriting mature libraries to reduce dependency count.

---

# 18. Testing Strategy

Selected quality posture:

> Ship first.

Testing should protect the framework and critical paths, not chase a coverage number.

## 18.1 Required test targets

### Unit tests

Focus on:

- tool registry behavior;
- persistence policy handling;
- worker execution wrapper;
- key pure transformation helpers;
- route metadata generation if custom.

### Smoke / integration tests

At minimum verify:

- application loads;
- deck renders;
- tool can be opened from navigation;
- command/search can find a tool;
- direct tool route resolves;
- 404 fallback recovers intended route;
- offline shell behavior works at a basic level;
- at least one worker-backed tool completes successfully.

### Post-V1 hardening direction

The original test bar intentionally optimized for shipping. Phase 23 does not erase that history; it raises the bar specifically where DUDE has become high-consequence: published vectors, independent reference cross-checks, property tests, fuzzing, golden corpora, destructive-action tests, sandbox regressions, deterministic fixtures, performance corpora, and capability-specific release gates.

## 18.2 Historical V1 Deferrals / Later-Roadmap Candidates

The following were deliberately deferred from the original V1 quality bar and remain preserved as such; later phases may adopt them selectively where they create real confidence rather than treating “exhaustive” coverage as a goal by itself:

- E2E tests for every tool;
- exhaustive accessibility automation;
- cross-browser CI matrix;
- visual regression infrastructure;
- performance lab;
- coverage percentage gates.

---

# 19. Accessibility Baseline

Accessibility is important but not the primary optimization target.

Minimum expectations:

- interactive controls are keyboard reachable;
- focus is visible;
- buttons use semantic elements;
- form controls have names/labels;
- command palette can be dismissed by keyboard;
- navigation state is understandable;
- obvious contrast failures are avoided — the bright/bold accent colors used throughout the UI (Section 8.5) must still meet a reasonable text/status contrast bar against the dark background, not just look vivid.

Formal accessibility certification is out of scope.

---

# 20. Initial Showcase Tool Set

The weekend MVP shipped **9 tools**, chosen because together they exercise different framework capabilities (parsing, worker execution, persistence policy, sensitive-data handling, third-party rendering, split-pane layouts, live computation). A 10th tool, UUID Generator / Inspector, was added ahead of schedule as the extension-speed proof (§3.1.A).

Each tool originally shipped with its own detailed feature list and a per-item "explicitly deferred" list; those lists are no longer reproduced here since every item on them was resolved during Phases 1–7 (see §21 Phase 7 in particular, which closed out this exact backlog). What still matters from V1 is *why* each tool was chosen — that framework-breadth rationale is preserved below.

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
| UUID Generator / Inspector | Developer | Originally planned as Phase 1 item #12; shipped early as the timed extension-speed proof (§3.1.A) — added, registered, and verified in 2 minutes 50 seconds with zero shell/core edits. |

Every feature and every originally-deferred capability across these 10 tools was eventually shipped — see each tool's entry in the live app, and §21 Phases 1–7 for when and how.

---

# 21. Roadmap

The roadmap deliberately extends beyond what any single delivery phase covers.

Phase 0 was the weekend commitment; it is complete. **Phases 1–29 are also complete.** Phase 8 established the Windows desktop track, Phase 21 established the cross-tool workflow foundations, and Phase 22 hardened the platform (distributed manifests, single-sourced metadata, structural validation, generated docs, dependency boundaries, chunk/cache budgets) for the next several hundred tools. Phases 30A–30L define the proposed workbench shell, discovery, insights, appearance, and verification program. Phase 30 and later roadmap work is taken up as decided rather than on any fixed schedule.

From Phase 22 onward, the roadmap deliberately stops treating raw tool count as the primary measure of progress. Platform trust, correctness, composition, native capability, local/offline strength, automation safety, discoverability, and reuse across surfaces matter more.

---

## Phase 0 — Weekend Framework Showcase (✅ Complete)

1. JSON Formatter / Validator
2. Regex Tester
3. Unix Timestamp Converter
4. Base64 Encoder / Decoder
5. Markdown Preview
6. JWT Debugger
7. Text Inspector
8. Hash Generator
9. Text Diff
10. UUID Generator / Inspector — shipped early as the timed extension-speed proof (§3.1.A); originally planned as Phase 1 item #12 below.

**Goal:** Validate architecture breadth. **Achieved** — all 10 tools shipped, deployed, and verified live.

---

## Phase 1 — High-Frequency Core Utilities (✅ Complete)

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

---

## Phase 2 — Structured Data Utilities (✅ Complete)

19. YAML ↔ JSON Converter — ✅ shipped
20. XML Formatter / Validator-lite — ✅ shipped
21. CSV Viewer / Converter — ✅ shipped
22. JSONPath / JMESPath Tester — ✅ shipped
23. JSON Structural Explorer — ✅ shipped as a "Tree" view on the JSON Formatter tool, see §20

**Goal:** Exercise more complex third-party libraries and richer structured outputs. **Achieved** — `js-yaml`, `fast-xml-parser`, `papaparse`, `jsonpath-plus`, and `jmespath` are each wrapped behind a pure, worker-compatible transform; two new shared UI primitives (`app-tree-view`, `app-data-table`) were introduced for structural/tabular display.

---

## Phase 3 — Web / API Utilities (✅ Complete)

24. HTTP Status Code Reference — ✅ shipped
25. HTTP Header Inspector / Builder — ✅ shipped
26. cURL Command Inspector / Converter — ✅ shipped, with code export to 8 languages
27. Cron Expression Parser / Next-Run Preview — ✅ shipped
28. User-Agent Parser — ✅ shipped
29. MIME Type Reference / Lookup — ✅ shipped

**Goal:** Cover common web/API-adjacent lookups and parsers entirely offline. **Achieved** — all 6 tools are fully local; `cron-parser`/`cronstrue` and `ua-parser-js` were added, and two new shared primitives (`app-copy-button`, `app-key-value-editor`) were extracted once their patterns started repeating.

### Notes

Local static references are preferred when practical. The HTTP Status Code Reference and MIME Type Reference ship as curated, verified-accurate subsets of their IANA registries rather than exhaustive transcriptions.

---

## Phase 4 — Developer Workflow Utilities (✅ Complete)

30. Semantic Version Comparator — ✅ shipped, with sorting and range-satisfaction checking
31. Glob Pattern Tester — ✅ shipped
32. URL / URI Inspector — ✅ shipped, with editable round-trip reconstruction
33. Date / Timezone Converter — ✅ shipped, as a multi-zone world clock
34. Duration Parser / Formatter — ✅ shipped
35. Random Data Generator — ✅ shipped, with full `@faker-js/faker` category coverage

**Goal:** Cover common developer-workflow utilities (versioning, glob matching, URL inspection, timezones, durations, fake test data) entirely offline. **Achieved** — all 6 tools are fully local; `semver`, `picomatch`, `luxon`, `parse-duration`, `humanize-duration`, and `@faker-js/faker` were added, continuing the library-forward pattern (§17) for fiddly parsing/formatting domains.

---

## Phase 5 — Richer Editors and Advanced Tools (✅ Complete)

36. WYSIWYG Rich Text Editor — ✅ shipped, via TipTap with sanitized HTML and Markdown export
37. Advanced Markdown Workspace — ✅ shipped, with GFM extras, front matter, a table of contents, and synced-scroll preview
38. JWT Signature Verification — ✅ shipped, as a separate JWT Signature Verifier tool (HMAC, RSA/EC/RSA-PSS, and JWKS)
39. File Hashing — ✅ shipped, as a separate File Hash Generator tool
40. File Base64 Conversion — ✅ shipped, as a separate File Base64 Converter tool
41. Advanced Diff / Merge — ✅ shipped, with line/word/character diffing, a merge view, and unified-diff export
42. JSON Schema Validator — ✅ shipped, supporting both Draft-07 and 2020-12

**Goal:** Validate that larger third-party libraries, new file-handling patterns, and the platform's first genuinely network-capable tool could ship without weakening the local-first/offline-first architecture. **Achieved** — `jose`, `ajv`/`ajv-formats`, the TipTap stack, and `markdown-it-task-lists` were added, all lazy-loaded per tool; a shared `FileDrop` component and `downloadFile` utility were introduced. JWT Signature Verification's JWKS-fetch mode is the first tool to call `fetch`, scoped so the tool's other, fully local modes stay usable offline.

---

## Phase 6 — Executable / Sandboxed Tools (✅ Complete)

48. JavaScript Playground — ✅ shipped, runs JS snippets with captured console output and a hard execution timeout
49. HTML Preview — ✅ shipped, live-renders pasted HTML including its own inline `<script>`/`<style>`
50. Template Renderer — ✅ shipped, renders EJS templates against a JSON context, reusing the JS Playground's execution engine
51. Python Playground — ✅ shipped, runs Python via Pyodide (WebAssembly CPython, standard library only)

**Goal:** ship the platform's first arbitrary-code-execution tools without weakening DUDE's security posture. **Achieved** — a shared `src/app/shared/code-sandbox/` module (an opaque-origin sandboxed iframe plus a nested, force-terminable Worker) backs the JS Playground and Template Renderer; HTML Preview uses a tool-local variant since it needs a live DOM; Python Playground self-hosts the Pyodide runtime behind its own lazy service-worker asset group. Ships as Milestones 17–20; §31's former standing "no arbitrary code execution" rule is amended accordingly — see §31.

### Notes

Implementation details (the sandbox's CSP/CORS/iframe-recreation gotchas, and the EJS client-bundle packaging decision) are documented at `src/app/shared/code-sandbox/code-sandbox-doc.ts` rather than repeated here.

---

## Phase 7 — Showcase Backlog Closure (✅ Complete)

Every item explicitly deferred in the original showcase tools' write-ups (§20), revisited once the platform had grown well past that MVP. Most landed as enhancements to the existing tool rather than new tools. Five items were large/independent enough to become new tools:

43. JWT Signer — ✅ shipped, symmetric (HMAC) and asymmetric (RSA/EC/RSA-PSS) signing with in-browser key-pair generation
44. Recurrence Rule Calculator — ✅ shipped, expands an iCal-style RRULE recurrence into occurrence dates
45. Date Calculator — ✅ shipped, business-day-aware date arithmetic and day-counting
46. Directory Diff — ✅ shipped, folder-vs-folder added/removed/changed comparison with a text line-diff or binary hex-diff drill-down
47. Git Repo Browser — ✅ shipped, client-side commit-history browsing and commit-vs-commit diffing over a locally-selected `.git` folder

**Goal:** close out the showcase backlog without compromising the offline-first, dependency-minimal architecture. **Achieved** — `uuid`, `rrule`, `isomorphic-git`, `jsonrepair`, `regexp-tree`, and `franc-min` were added; Text Inspector's grammar-check mode became the second tool (after JWT Signature Verifier) to call `fetch`; Markdown Preview/Workspace gained style presets plus a sandboxed-iframe path for custom CSS/plugins — all with no changes to the shell/registry/persistence/worker infrastructure.

**Explicitly out of scope at the time, now revisited:**

- **AI-based regex generation/explanation** needed either a hosted LLM proxy or local-model support DUDE didn't have at the time — ✅ shipped since, as part of §21 Phase 8 Stage 4's local LLM proxy (natural-language → regex generation and an "AI Explain" panel on Regex Tester). The rest of the source material's "Local AI Utilities" family that Stage 4 didn't cover is now expanded in Phase 36 (AI-Assisted Utilities), with deeper on-device AI in Phase 69 and AI workflow/agent work in Phases 70–71.
- **Collaborative real-time editing** (Markdown) over the open internet via DUDE-operated hosted rooms/documents/auth remains outside the current hosted-cloud boundary. The shipped, in-scope model is narrower: same-machine/LAN collaboration and a user's own self-hosted relay; see §5.2 and §21 Phase 8 Stages 6–7.

### Notes

Grammar checking's LanguageTool dependency is the platform's first *external* API call (JWT Signature Verifier's JWKS mode fetches only URLs the user supplies themselves); its free-tier limits are why it's a manual "Check" button rather than live-as-you-type.

Git Repo Browser and Directory Diff both read an entire local folder into browser memory via `<input webkitdirectory>` rather than the File System Access API's `showDirectoryPicker()`, for broader browser support.

---

## Phase 8 — Downloadable Desktop App with a Bundled Backend (✅ Complete — Framework: Establishes the Desktop-Packaging Track — all 8 stages shipped)

Like Phase 0, this is a framework-first phase: it adds a new deployment target and a bundled backend, not new tools with registry entries. Tool-level enhancements that land as part of this phase (Regex Tester, Advanced Markdown Workspace, Directory Diff, Git Repo Browser) stay documented inside their own §20 sections rather than incrementing the shipped-tool count, the same way Phase 7's enhancements did.

**Original Phase 8 implementation goal (historical):** ship a Windows Electron build in which every existing web tool still works identically while unlocking backend-dependent features impossible on static GitHub Pages hosting: an AI-assisted regex workflow and real-time collaborative Markdown editing. The Phase 8 design was originally described as a “strict superset of the web PWA.”

**Current product interpretation:** that “strict superset” phrase is retained only as Phase 8 history, not as the conceptual definition of desktop. DUDE Desktop is now the canonical workbench; the web/PWA build is the browser-safe companion generated from the same shared core.

**Approved direction**, decided directly with the user:

- **Packaging:** Electron.
- **Backend:** a localhost-only LLM proxy process, provider-agnostic (a configured OpenAI-compatible base URL + API key, so it works with OpenAI, Anthropic-compatible gateways, local Ollama, OpenRouter, etc.) — plus a local collab server for same-machine/LAN sessions, extended by a **BYO relay server** for cross-network collaboration.
- **BYO relay, not a DUDE-run service:** DUDE ships the relay server's code (e.g. as a Dockerfile/small deployable unit in this repo); each user self-hosts their own instance and points their desktop app at it. DUDE itself never operates shared infrastructure — see the durable hosted-cloud boundary in §5.2.
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

### Security notes (extending §31)

- The bundled backend must bind to `127.0.0.1` only (falling back to `127.0.0.2`, `127.0.0.3`, etc. if something else is already listening there, or to another user-provided address) — never an external interface. **One deliberate, narrow exception:** Stage 6's local collab server binds `0.0.0.0`, since LAN reachability is the entire point of that stage; the mitigation is a random per-session code required as a `?code=` query param before any WebSocket connection is accepted, not network-interface restriction.
- The Electron renderer keeps `contextIsolation` on and no direct `nodeIntegration`; all native access (files, secrets, tray, IPC to the local backend) is mediated through a preload bridge — consistent with the sandboxing precedent already set by the Advanced Markdown Workspace's plugin `<iframe>`s (§20; §31).
- A self-hosted BYO relay server is untrusted-by-default from the app's perspective: treat its messages as data, not as anything the app should extend trust or execute based on. In practice (Stage 7), this means every message a relay forwards is applied purely as opaque Yjs CRDT sync/awareness data — the relay never supplies a URL, config, or code the app follows or executes.

### Notes

Stage 1 chose a local loopback static server (bound `127.0.0.1`, OS-assigned port) to serve the built app to the `BrowserWindow` over `http://`, instead of a `file://` load — this means the existing path-based router needed no hash-routing fork, and the server does real SPA fallback to `index.html` instead of needing the web build's `public/404.html` GitHub Pages workaround. The new `electron/` folder (main process + preload, compiled by `esbuild` to CommonJS) stays entirely outside `tsconfig.app.json`, mirroring the existing `tsconfig.worker.json` precedent for a second narrow build target; see `electron/AGENTS.md` for the contextIsolation/sandbox/preload-bridge rule it documents. A new `angular.json` `electron` build configuration overrides `baseHref` to `/` and disables the service worker (unsupported/redundant outside a real HTTP(S) origin's normal lifecycle, and superseded by Stage 8's `electron-updater`); `PlatformService` (§25.6) also gates the service worker's runtime registration off under Electron as a second layer of defense. `npm run electron:dev` points Electron at a live `ng serve` for hot-reload development; `npm run electron:start` runs the full build → compile → launch path. Packaging (`electron-builder`, installers, CI) stays deferred to Stage 8, per plan.

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

## Phase 9 — Structured Data Depth (✅ Complete)

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

### Notes

Large JSON Streaming Viewer and JSON Table Viewer extend the existing JSON Formatter's Tree view (§20) rather than becoming separate tools. `sql.js` (SQLite compiled to WASM) is the natural library for #33, consistent with the library-forward dependency philosophy (§17); TOML support (#1, #2) uses `smol-toml`; the XSD Validator (#21) uses `xmllint-wasm` (libxml2 compiled to WebAssembly). Both `sql.js` and `xmllint-wasm` needed an explicit build-time asset copy plus a service-worker cache-manifest entry (mirroring Pyodide's existing pattern in §21 Phase 8) — neither library's own bundler-asset-detection worked out of the box against this app's esbuild-based build, and `sql.js`'s browser build resolves to a differently-named `.wasm` file than its Node build, only caught via real end-to-end browser testing rather than unit tests.

---

## Phase 10 — Text Processing Depth (✅ Complete)

Goal: extend the Text category with a full Unicode/line-manipulation toolkit and deeper text analysis than Text Inspector currently covers.

**Achieved (Milestones 73-91, plus 4 Advanced Diff/Merge enhancement milestones):** the original 40-item list was consolidated to 19 new/extended tools plus the 6 originally-planned Advanced Diff enhancements, merging closely-related line/character operations into single tools with an internal mode selector, dropping the item already covered by an existing tool, and reinterpreting one item that didn't map onto a paste-based (non-editor) tool:

1. Unicode Character Inspector
2. Unicode Code Point Converter
3. Invisible/Control/Zero-Width Character Scanner (consolidates the original Invisible Character Viewer, Control Character Viewer, and Zero-Width Character Detector into one scan pass)
4. ASCII Table
5. Unicode Table
6. Unicode Normalization (NFC / NFD / NFKC / NFKD)
7. Smart Quotes Normalizer
8. Whitespace Cleaner extension: Line Ending Converter, Tabs ↔ Spaces, Indentation Converter (enhancement to the existing Whitespace Cleaner / Normalizer tool, §20 — not a new tool)
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

**Dropped from this phase:** Regex Find/Replace — already covered by the existing Regex Tester's replace mode (§20).

**Advanced Diff / Merge enhancements (items 35-40 of the original list)** all shipped as 4 incremental milestones enhancing the existing tool (§20) rather than new tools:

20. Ignore-whitespace / ignore-line-endings / ignore-case options (also threaded through the three-way merge path)
21. Semantic JSON/YAML/XML diff modes — one shared structural-diff engine (`fast-json-patch`'s `compare()`), three parser front-ends
22. Moved-block detection — exact-match pairing of remove-only/add-only hunks, purely informational
23. Image diff mode — pixel-level comparison via `pixelmatch`, fully separate payload/worker since images are a different data type from the rest of the tool

### Notes

Language Detector and Readability Analyzer already shipped (§21 Phase 7); Text Statistics already ships on Text Inspector.

---

## Phase 11 — Encoding & Numeric Representation Lab (✅ Complete)

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

### Notes

Base64/Base64URL, JSON Escape/Unescape, and Unicode Escape/Unescape already ship. This phase absorbs the source doc's separate "Numbers & Mathematics" section rather than opening a new category — everything here fits Encoding, Web, or Developer without a taxonomy change. Three new dependencies were added: `mathjs` (Statistics/Matrix/Expression tools), `base-x` (Base36/58/62), and `rfc4648` (RFC-conformant Base32) — plus `punycode` for the Punycode Converter. Base85/ASCII85 and basE91 are hand-rolled, since no well-maintained package implements either's bit-chunked spec.

---

## Phase 12 — Security, Cryptography & Certificate Depth (✅ Complete)

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

### Notes

Web Crypto API covers AES/RSA/EC/Ed25519 generation and SHA-family hashing/fingerprinting natively; `node-forge` is the fallback for ASN.1/PEM/DER/X.509/CSR/PKCS#12 handling per the library-forward philosophy (§17), added to `angular.json`'s `allowedCommonJsDependencies` in Milestone 117. Every hand-rolled or forge-based crypto path (SSH wire format, X.509 fingerprints, PKCS#12 decryption) was cross-validated in its unit tests against real, independent tool output (`ssh-keygen`, `openssl`) rather than only against itself. Live TLS handshake fetching (cipher/ALPN/SNI inspection, expiration *monitoring* over time) needs live socket/network access and **shipped in Phase 28** as the TLS Connection Inspector, Live Certificate Chain Fetcher and Certificate Watch List; those tools hand a live-fetched chain back to these Phase 12 file-based tools for detailed inspection.

---

## Phase 13 — Auth & JWT Depth (✅ Complete)

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

### Notes

JWKS fetching-by-URL already ships on the JWT Signature Verifier (§20); every Phase 13 tool operates on pasted/uploaded material instead, so no new network policy was introduced. AWS SigV4 and HTTP Digest Auth were hand-rolled rather than adding a new dependency (no `aws4`/AWS SDK existed in the project), cross-validated in their unit tests against independently computed reference chains (an AWS-documented worked example for SigV4; the classic RFC 2617 example for Digest Auth) rather than only self-consistency round-trips — the same posture Phase 12 used for its hand-rolled SSH/crypto paths.

---

## Phase 14 — Date & Time Depth (✅ Complete)

Goal: round out Date & Time with additional parsers and time-math utilities beyond timestamp conversion, timezones, duration, and cron.

**Achieved (Milestones 137-143):** the original 15 items consolidated into 6 new tools plus one bundled enhancement to two existing tools, per the design already anticipated by this phase's own Notes below:

1. Week Number Calculator (items 7+8; one bidirectional tool — date → ISO week-year/week/weekday and back — rather than two one-direction tools, matching this codebase's existing bidirectional-tool pattern, e.g. Base64 Encoder/Decoder)
2. DST Transition Explorer (item 6; day-by-day offset scan + binary search, hand-rolled since no library exposes transition instants directly — the scan itself lives in a new shared `shared/utils/dst-transitions.ts` since Timezone Offset Comparator needs the same data)
3. Timezone Offset Comparator (item 5; a year-long offset grid across multiple zones *and* a pairwise ahead/behind calculator with next-change lookahead, both in one tool — the existing Date/Timezone Converter already covered a single moment's per-zone offset, so this had to do something that tool didn't)
4. Relative Time Parser (item 9; bidirectional — free text to timestamp via a new `chrono-node` dependency, since natural-language date parsing is exactly the "genuinely fiddly" case that justifies a library per §17.1; timestamp back to text via the native `Intl.RelativeTimeFormat`)
5. Stopwatch & Countdown (items 11+12; one tool with a mode toggle — the first real-time-ticking UI in the codebase, anchored on persisted start/target instants rather than a raw ticking counter so a reload mid-run resumes correctly)
6. Epoch Timeline Visualizer (item 13; a free list of labeled timestamps *and* a start/end range, both modes plotted through a new shared `shared/components/timeline/` primitive)
7. Unix Timestamp Converter + Cron Expression Parser enhancement (items 1-4 and 14-15, bundled into one milestone since neither is a new tool): Unix Timestamp Converter gained ISO 8601/RFC 3339/RFC 2822 auto-detected string input (`luxon`'s `fromISO`/`fromRFC2822`) and BigInt-backed microsecond/nanosecond units; Cron Expression Parser gained a previous-runs list (`cron-parser`'s already-available `prev()`), a next/previous direction toggle, verbose `cronstrue` humanization, and a 25-run option

Item 10 (Duration → ISO 8601) needed no work: the existing Duration Parser/Formatter already accepted human-or-ISO-8601 input and always returned an `iso8601` field in its result.

### Notes

`luxon` already covers most of the parsing/timezone math per Phase 4; items 1-3 and 14-15 extended the existing Cron Parser / Unix Timestamp Converter rather than becoming new tools, per the plan above.

---

## Phase 15 — Web & HTTP Depth (✅ Complete)

Goal: deepen the Web category's URL/header/request tooling and broaden cURL's language coverage, all construct-and-display rather than send-a-real-request.

**Achieved (Milestones 144-160):** the original 24 items consolidated into 12 new tools and 5 enhancements to existing tools, with 2 items needing no work and 1 cut outright:

1. URL/URI Inspector — URI Component Visualizer enhancement (item 3; colorized scheme/userinfo/host/port/path/query/fragment breakdown view via a new RFC 3986 Appendix B segmenter; items 1-2, URL Parser and URL Builder, needed no work since this tool already parses, edits, and round-trips every part)
2. URL Normalizer & Comparator (items 4-6; new tool, three modes — Normalize, Resolve, Compare — sharing one RFC 3986 §6.2 normalization core)
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

### Notes

Two new `shared/` extractions followed the "extract when a second tool needs it" pattern already established in Phase 14: `shared/utils/url-homograph.ts` (mixed-script detection via native `\p{Script=...}` regex property escapes, the same technique `unicode-general-category.ts` uses) serves URL Safety Inspector and Punycode Converter's Inspect mode; `shared/http-request/` (relocated from `tools/curl-converter/`: the canonical `ParsedHttpRequest` model, `curl-build.ts`, and every `export/` language generator) serves cURL Command Inspector/Converter and the new HTTP Request Builder/Converter, which gets every export-language target "for free." `shared/utils/http-status-codes.ts` (relocated from HTTP Status Code Reference) similarly now serves HTTP Response Viewer's status-line lookup.

Item 21's original 12-language list (C#, Python requests, Python httpx, Java HttpClient, Kotlin, Go, Rust, PowerShell, PHP, Ruby, Dart, Swift) turned out to overlap the existing 8 shipped languages in 5 places (C#, Python requests, Java HttpClient, Go, PowerShell already shipped pre-Phase-15) — only the 7 genuinely new targets needed writing.

CORS Header Builder was planned to extract CSP Builder's directive/source-list row editor into a shared component (the anticipated "second consumer" moment), but building it revealed the shapes don't actually converge: CSP's values are space-separated multi-directive lists, CORS's Allow-Methods/Allow-Headers are single comma-separated fields. Each tool kept its own hand-rolled UI rather than force a shared abstraction that wouldn't meaningfully reduce duplication.

---

## Phase 16 — Regex Depth (✅ Complete)

Goal: extend Regex Tester with visualization and benchmarking beyond the existing explainer/flavor-notes/replace features (§21 Phase 7).

**Achieved (Milestones 161-164):** all 4 items shipped as their own tool, one-to-one with the original list:

1. Regex Visualizer (item 1; railroad diagram, built by walking the same regexp-tree AST node types regex-explain.ts already walks and mapping them to a new `railroad-diagrams` dependency's Diagram/Sequence/Choice/Terminal primitives — real DOM SVG output with built-in HTML-entity escaping, verified via a dedicated XSS-safety spec case)
2. Regex Benchmark (item 2; a static heuristic AST scan for the two classic catastrophic-backtracking shapes — nested unbounded quantifiers, an unbounded quantifier around alternation — plus live per-sample timing, one worker per sample rather than one worker looping all samples, so a hung sample only costs that one job)
3. Regex Flavor Converter (item 3; JS/Python/Java/.NET/PCRE/Go RE2, via a small named-group/backreference syntax normalization pass ahead of regexp-tree's JS-only parser, then a per-target-flavor AST-to-string emitter; a construct the target can't represent at all is still emitted with a disclosed warning, never silently dropped)
4. Regex Generator (item 4; non-AI, heuristic, offline — run-length character-class tokenization with self-validation against every example/counter-example before a pattern is ever shown; the already-shipped Phase 8 Stage 4 AI-based natural-language-to-regex feature is untouched and distinct from this)

### Notes

`regexp-tree`'s existing AST (§21 Phase 7) was the shared front end for three of the four tools (Visualizer, Benchmark's static heuristic, Flavor Converter), exactly as anticipated. `shared/utils/regex-ast-features.ts` (relocated from `regex-flavor-notes.ts`'s `detectFeatures()`) is a new "extract on second consumer" shared util, the same pattern used throughout Phase 15 — the Flavor Converter needed it to warn when a target flavor can't represent a construct the source uses.

The `railroad-diagrams` npm package (real npm package, zero dependencies, CC0) turned out to interop cleanly through esbuild via `allowedCommonJsDependencies` (confirmed with a real install + `ng build`) rather than needing the `ejs`-style static-asset-copy workaround that was anticipated as a real risk going in.

The Benchmark tool's live-timing design changed from the plan's original one-worker-loops-all-samples idea: the shared worker protocol's `progress` channel turned out to be a plain number with no room for a rich per-sample payload, so a hung sample would have silently lost every already-completed sample's timing along with it. Dispatching one isolated, independently-cancelable worker per sample avoids that entirely, at the cost of more worker-spawn overhead per run.

---

## Phase 17 — Design, Markup & Media Tools (✅ Complete)

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

### Notes

Milestone 174 (between Tailwind Color Matcher and Box Shadow Generator) built the `css-preview-sandbox` shared primitive — a sandboxed-iframe live-preview component, modeled on HTML Preview's iframe+CSP pattern but locked down further (no `allow-scripts` at all, since these tools render CSS only, never user script) — that all seven CSS live-preview tools (items 10-16) share. It's a framework-layer milestone with no numbered item of its own, the same pattern Milestone 16's `regex-ast-features.ts` extraction used.

Item 30 (Image Compressor) deviates from this section's original plan: a real WASM codec (`@jsquash/jpeg`/`webp`/`png`, the maintained successor to `@squoosh/lib`) was implemented first, but its Emscripten `locateFile` resolution breaks once Angular's esbuild-based production build bundles the codec module — the `.wasm` binary never made it into `dist/`, a defect only a real `ng build` caught, not the unit test suite. Image Compressor ships on plain `canvas.toBlob()` quality-based compression instead: real but more modest size reduction, zero bundling risk. Items 27–29, 31-32, and 34-35 (the rest of the image/SVG tools) all shipped as originally planned, since none of them needed a WASM codec.

Items 38 and 40 (QR Code Scanner, Barcode Reader) are the first `getUserMedia`/camera-API use anywhere in the codebase; `docs/SECURITY.md` gained a new "Camera access" section documenting it, alongside the network-exception entry item 26 added.

---

## Phase 18 — Code Generators & Developer References (✅ Complete)

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
29. npm / PyPI / crates.io / NuGet Package Metadata Inspector — requires `fetch` to the relevant public registry; flagged `networkRequired`, same pattern as the existing JWKS-fetch and grammar-check tools (§20, §21 Phase 5/7) (Milestone 216)

### Notes

Item 23 (Compression Lab) shipped without Brotli/zstd: the Compression Streams API (the dependency-minimal, native-first choice per `/AGENTS.md`) only exposes `gzip` and `deflate` codecs in-browser: Brotli and zstd have no equivalent native API and would have required a WASM dependency for a comparison feature, so the item shipped narrower than originally scoped rather than pulling one in.

Items 26 and 27 (Semantic Range Evaluator, SemVer Range Visualizer) were both absorbed into the Milestone 14 Semantic Version Comparator (`semver-comparator`) instead of becoming a new `dependency-version-comparator`-style tool: its existing Range Check tab already handled compound ranges, and the Visualize tab was a small, natural addition to the same tool rather than a separate one.

Item 29 (Package Metadata Inspector) covers npm, PyPI, crates.io, and NuGet — Maven was dropped from the original five-registry list; Maven Central's search API doesn't expose a comparable single-package metadata endpoint without XML POM parsing, judged not worth the added complexity for this item.

Item 24 (Archive Creator / Extractor) used `fflate` for ZIP and a hand-rolled USTAR reader/writer plus the native Compression Streams API for TAR/TAR.GZ, rather than a single archive library, matching the dependency-minimal-by-default rule (`/AGENTS.md`).

---

## Phase 19 — IDs, Mock Data & Git/SQL/Container Config Tooling (✅ Complete)

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

### Notes

Items 8-16 are distinct from the existing Git Repo Browser (§20), which already does commit-history browsing/diffing over a locally-selected `.git` folder via `isomorphic-git` — these are text/URL-level tools with no repository needed. Items 43-48 look like "Networking" but are pure math/string manipulation and therefore remained browser-safe. Live database connections (SQL Server/PostgreSQL/MySQL/Redis/MongoDB explorers) are covered by Phase 33, while live Docker/Kubernetes daemon/cluster access is covered by Phases 34 and 50.

New dependencies added: `ulid`, `nanoid`, `@paralleldrive/cuid2` (item 2-5), `sql-formatter` and `node-sql-parser` (items 17-24). `ksuid` was deliberately **not** added — the published npm package hard-requires Node's `crypto`/`Buffer` globals with no browser build, so item 6 hand-rolls the same base62/epoch scheme instead (base62 encode/decode via the already-installed `base-x`, randomness via Web Crypto). Gitignore Generator (item 10) ships a curated, bundled template set rather than a live GitHub gitignore-API fetch, keeping every one of this phase's 48 tools fully offline — no `docs/SECURITY.md` changes were needed.

---

## Phase 20 — File & Binary Format Inspection (✅ Complete)

Goal: add file-upload-based binary/executable/format inspection — parsing whatever bytes the user provides, no OS access needed.

**Achieved (Milestones 266-281):** 16 tools shipped, three foundational shared utilities extracted along the way (`shared/utils/byte-entropy.ts`, `binary-strings.ts`, and `struct-reader.ts`, alongside the pre-existing `byte-codec.ts`), consumed in dependency-first order rather than the source list's original numbering:

1. File Signature & Type Detector (Milestone 266) — merges the source list's items 2 (File Signature Inspector) and 3 (File Type Detector) into one tool: raw magic-byte match plus ZIP-container disambiguation (docx/xlsx/pptx/jar/apk/odt/ods/odp) and an extension-mismatch warning, on a much larger shared signature table (`shared/utils/file-signatures.ts`) than File Base64 Converter's original MIME-sniffing (§21 Phase 7)
2. File Entropy Analyzer (Milestone 267) — introduced `shared/utils/byte-entropy.ts` (true Shannon byte-distribution entropy, distinct from Secret Detector's charset-based estimate, §19 item 40)
3. Byte Frequency Analyzer (Milestone 268)
4. Binary Strings Extractor (Milestone 269) — introduced `shared/utils/binary-strings.ts`
5. Encoding Detector (Milestone 270)
6. BOM Detector / Remover (Milestone 271)
7. Hex Editor (Milestone 272) — a genuinely interactive click-to-edit byte grid, kept distinct from the pre-existing Hex Dump Viewer/Builder's paste-and-rebuild-from-text workflow (§21 Phase 11) rather than duplicating it
8. Hex Diff (Milestone 273) — extends Directory Diff's binary hex-diff mode (§21 Phase 7) into a standalone single-file tool; extracted `computeByteDiff`/`looksLikeText` to `shared/utils/byte-diff.ts` on this second consumer
9. Binary Structure Inspector (Milestone 274) — introduced `shared/utils/struct-reader.ts` (endianness-aware DataView primitives), the foundation items 10-12 build their fixed schemas on; a general user-defined field-list parser rather than a hardcoded set of known formats
10. PE (Windows executable) Header Viewer (Milestone 275)
11. ELF Header Viewer (Milestone 276)
12. Mach-O Header Viewer (Milestone 277)
13. DPI Calculator (Milestone 278)
14. Aspect Ratio Calculator (Milestone 279) — extracted Image Metadata Inspector's local ratio-simplification helper to `shared/utils/aspect-ratio.ts` on this second consumer
15. Resolution Calculator (Milestone 280)
16. File Inspector (Milestone 281) — the "File Forensics" summary dashboard, built last since it composes the signature/entropy/strings utilities items 1, 2, and 4 introduced

### Notes

The source list's item 9 (Endianness Viewer) was dropped outright rather than shipped: it would have duplicated the already-shipped Numeric Representation Inspector (§21 Phase 11), which covers byte-order/IEEE-754/integer representation across bit widths. PE/ELF/Mach-O header viewers (items 10-12 above) only need the uploaded binary's header bytes, not a running executable, so they remained browser-safe despite reading like "system" tools; their import/export/dylib table parsing is basic (names and counts, not full symbol/relocation tables). Items 13-15 are pure math and were pulled out of the source doc's "Screen / Pixel Tools" section — the native live-screen variants (screen ruler, live pixel picker) are covered by Phase 35.

---

## Phase 21 — Cross-Tool Workflow Foundations (✅ Complete — Universal I/O Contract shipped as Milestone 31, Transformation Pipelines + user-defined tool scripting shipped as Milestones 283–286, Smart Paste-Detection shipped as Milestone 288, Persistent Workspace/Scratchpad + Saved Sessions shipped as Milestones 289–294, Persistent Local History shipped as Milestones 295–297)

Unlike every other phase in this roadmap, this one was never "pick an item, build it in the existing pattern" — its items are cross-cutting architecture ideas that change the tool registry contract itself rather than adding a new tool that consumes it, so most of them stay placeholders until they get their own design pass.

1. **Universal Input/Output Contract** — ✅ shipped as Milestone 31. Pipelines are only "almost automatic" if tools already agree on what they consume and produce: every tool declares its inputs/outputs in a small shared vocabulary — `Text`, `Bytes`, `File`, `JSON`, `Table`, `HTTPResponse` — instead of inventing its own ad hoc shape. `DudeDataType` (`src/app/shared/models/tool-io.model.ts`) is `text | json | bytes | file | table | url | http-response`; `ToolDefinition.io: { accepts, produces }` is populated on every registry entry. This is declarative documentation only, following the same soft-launch precedent as `persistence`/`execution`/`network` — items 2–5 below still each need their own design pass before being scheduled; only the shared vocabulary itself is done.
   - **Milestone 282 audit:** with all 277 tools declaring `io`, a read-only audit checked accuracy (does the declared `io` match what each tool's component actually does) rather than just presence. It found real drift across ~33 tools — mostly `produces` omitting `file` despite a working download/export button, plus several tool-cluster inconsistencies with no documented rule (generator `accepts` conventions, decoder-family `produces`, CSV/JSON-family type pairing). Milestone 282 corrected those, made `io` a required field on `ToolDefinition` (was `io?:`) so a future tool can't omit it, and wired the previously-unused `http-response` type into `curl-converter`/`http-request-builder`'s `accepts`. Two things were deliberately left for a future pass rather than decided unilaterally here: (1) a larger, unresolved split between a "text-report" and a "json-structured-findings" convention across ~20 config/git-linter vs. binary-forensics tools, and (2) vocabulary gaps the current 7-type set can't cleanly express — no arity concept for two-input tools (diff/merge/join), no distinct type for a directory/multi-file bundle (`directory-diff`, `archive-tool`) or a live camera stream (`qr-code-scanner`'s webcam mode) vs. a single `file`.
2. **Transformation Pipelines** — ✅ shipped as Milestones 283–286. Chains existing tools into a single reusable workflow (e.g. `Base64 Decode → JSON Formatter → …`) instead of visiting separate tools and manually copying output to input each time, via a new `PipelineStep` contract (`src/app/shared/models/pipeline-step.model.ts`) that 225 of 277 tools were mechanically retrofitted with — a thin `<id>.pipeline-step.ts` adapter per tool, resolved purely by naming convention (`core/pipeline/pipeline-step-loader.ts`'s convention-derived dynamic import), never a hand-maintained field on `ToolDefinition` or a parallel id-keyed map. The remaining 52 tools are deliberately excluded and individually documented (`core/pipeline/pipeline-coverage.spec.ts`): genuine multi-input tools (diff/merge/join-shaped, or a document+schema pair — the vocabulary gap Milestone 282 already flagged), network-required tools, crypto tools needing a caller-supplied key with no honest zero-config mode, interactive/stateful UIs with no real transform, and tools with no pure-logic file to adapt without a rewrite. Chaining is sequential-only (no branching/fan-out) with no automatic type coercion between steps — a mismatch must be bridged by inserting another compatible tool (or a script, below), never silently converted. This was, as anticipated, the one roadmap item allowed to touch `shell/`/`core/`: a new `/pipelines` route tree and sidebar entry (`src/app/shell/pipelines/`), kept registry-adjacent rather than a 278th tool (no category, no `TOOL_DEFINITIONS` entry).
   - **User-defined tool scripting** — ✅ shipped alongside Transformation Pipelines as Milestone 286, as a dependent extension of it: a user writes and locally saves their own custom transformation step (`/pipelines/scripts`), reusing the sandbox already shipped in Phase 6 (an opaque-origin iframe plus a nested, force-terminable Worker) unmodified rather than needing new execution infrastructure. At the time this shipped, it was explicitly distinguished from the then-banned “plugin installation from remote sources” (§5.2): a user's own script never leaves their machine or gets distributed to anyone else. That distinction remains important even though Phases 56–57 later revisit extensions under a separate signed, capability-declared, sandboxed model. A script is a first-class step type validated exactly like a built-in tool step (it declares its own `accepts`/`produces`), and a hung/errored/malformed-output script halts the pipeline the same way a failed built-in step would.
3. **Smart Paste-Detection** — ✅ shipped as Milestone 288. A dedicated `/smart-paste` page (`src/app/shell/smart-paste/`) that inspects pasted content and suggests the tool that understands it. This matters for discoverability the way the command palette (§9.3/§26) already helps when a user knows what they want but not where it lives — this helps when they don't yet know what they want to do with what they're holding. A curated, hand-maintained `PASTE_DETECTORS` registry (`src/app/core/paste-detect/`, 11 shapes for v1: JSON, JWT, UUID, ULID, KSUID, Snowflake id, hex color, IPv4/IPv6, URL, Base64, Unix timestamp) ranks candidate matches by confidence, reusing each tool's existing pure-logic export rather than reimplementing shape recognition. Deliberately **not** the same per-tool `<id>.pipeline-step.ts` convention Item 2 uses — detection has to run every detector against the same input on every keystroke, which the per-paste dynamic-import cost of that convention doesn't suit at this curated scale (see `src/app/core/paste-detect/AGENTS.md`). Picking a suggestion navigates to the matching tool and prefills its input via a one-shot, in-memory-only hand-off (`PasteHandoffService`) — never persisted, consistent with §14.1's sensitive-payload default. Ambient/global paste capture (detecting a paste anywhere in the app, not just on this dedicated page) was considered and deliberately deferred to a future pass; NanoID was excluded from the v1 shape set for having no fixed structural signature to detect against. **Extended (Milestone 473):** 12 document-format detectors (SVG, HTML, XML, Markdown, YAML, Kubernetes manifests, SQL, CSV, CSS, Dockerfile, `.env`, stack traces) joined the 11 ID/token shapes. They use lightweight, bounded structural sniffers (`core/paste-detect/text-format-sniffers.ts`) rather than the owning tools' parsers — `PASTE_DETECTORS` ships in the prefetched shell via the ambient chip, and those parsers are heavy lazy dependencies — and are scored so any ID/token match outranks them. Their targets receive the paste through the Universal File Input text hand-off (Phase 24 Item 4's follow-up), which writes it into the tool's own declared input key: the value lands only where that tool's own persistence policy would have put it had the user typed it; `PasteHandoffService` itself remains in-memory-only.
4. **Persistent Workspace / Scratchpad** — ✅ shipped as Milestones 289–294. A multi-tool workbench (not a source-code IDE, per the ceiling below): a tab strip and a recursive panel tree let more than one tool be open — and, via "split right," visible side by side — at once, mounted through a new `ToolHost` (`src/app/shell/workspace/tool-host/`) that dynamically loads a tool's existing lazy `ToolDefinition.load()` via `NgComponentOutlet`, rather than named router outlets (rejected — panel count is open-ended, which would mean either a multiplicative blow-up of the route table per outlet slot or an ever-growing URL segment nothing else in DUDE does). Panels reuse the existing `SplitPane` primitive (§13) unmodified. A collapsible scratchpad drawer holds manually-saved snippets/notes, independent of the automatic per-tool mirroring. The shared `<id>.workspace-step.ts` adapter convention (`src/app/shared/models/workspace-step.model.ts`, resolved by the same naming-convention dynamic import as Item 2's `<id>.pipeline-step.ts`) is what both this item and Item 5 build on. **The governing rule, resolving the hardest design tension:** no part of this feature may ever cause a tool's content to outlive the `PersistencePolicy` that tool's own code already declares (§14.1) — tab/panel *layout* is treated as the "layout preference" §14.1 already names as safe to persist and restores unconditionally via a `local`-policy pseudo-tool store (`'__workspace__'`, the same synthetic-toolId trick `PipelineStoreService` uses for `'__pipelines__'`), but tool *content* is never separately copied or promoted — restoring a tab just remounts that tool's component, which re-reads its own already-existing `persistence.signal` values exactly as on any ordinary navigation. This is also why the originally-anticipated IndexedDB "durable content tier" for Saved Sessions turned out to be unnecessary (a real relaunch wipes all in-memory JS state anyway, leaving only `localStorage`/`sessionStorage`, which the tool's own code already reads correctly) — see `core/workspace/AGENTS.md`.
   - **Saved Sessions** — restoring open tools/inputs on relaunch — shipped as part of this (Milestone 293), exactly as the governing rule above describes: layout always restores; content restores only insofar as each tool's own policy already allowed it.
5. **Persistent Local History** — ✅ shipped as Milestones 295–297. A cross-tool history (`/history`, `src/app/shell/history/`) backed by a new IndexedDB store (`src/app/core/history/history-db.ts`, on top of a shared `src/app/core/storage/indexed-db.ts` primitive — this codebase's first IndexedDB usage) with per-tool/global/age/size retention caps that degrade gracefully (§29) rather than throwing. Reuses Item 4's `<id>.workspace-step.ts` adapter rather than a second convention: a tool opts in via an explicit `historyEligible: true`, defaulting to excluded — deliberately **not** inferred from the tool's own `PersistencePolicy`, since that field answers a narrower question ("does this survive a refresh, inside this one tool") than History's actual one ("should this sit in a global, searchable, cross-tool feed indefinitely"); see `core/history/AGENTS.md` for the exclusion categories (sensitive-by-design, pure reference/lookup, sandboxed-execution-source-only). The mechanical retrofit (Milestones 296–297) touched 215 of 277 tools; the remaining 62 are individually documented in `core/workspace/workspace-coverage.spec.ts` (mirroring `pipeline-coverage.spec.ts`'s shape) — mostly binary/file-upload-only tools with nothing serializable, pure-reference tables, or tools whose relevant field is already sensitive-by-design in the tool's own code. `ToolShell.ngOnDestroy` is the single capture trigger, firing identically whether a tool was left via its own route or swapped out of a Workspace panel; clicking a History entry reuses the exact same `workspaceStep.restore()` `ToolHost` uses for tab reopen.

### Notes

This phase intentionally breaks from §4.7's "any single unit of work should be scoped and finished on its own terms" — these items are listed together because they're interdependent, not because they're meant to ship as one unit.

**Amendment (2026-09-21):** Appendix A's Q11 (Navigation) originally read “no IDE-style persistent tabs.” That boundary narrowed, rather than reversed, when item 4 became a real roadmap item: the Phase 21 standing ceiling was “a multi-tool workbench, not a source-code IDE,” and a Monaco-style full IDE was explicitly out of scope at that point. Later Phases 77–80 deliberately revisit editor/LSP/terminal/project surfaces, but the durable §5.2 identity boundary still prevents DUDE from becoming a conventional VS Code clone; see the Workbench Identity Gate before Phase 77.

**Amendment (2026-09-25):** Items 4–5 complete their design pass and ship. The one rule that resolved the hardest tension between them and §14.1/§30: **neither feature may ever cause a tool's content to outlive the `PersistencePolicy` that tool's own code already declares.** Tab/panel *layout* is treated as the "layout preference" §14.1 already names as safe to persist, and restores unconditionally via a `local`-policy pseudo-tool store (`'__workspace__'`, the same synthetic-toolId pattern `PipelineStoreService` uses for `'__pipelines__'`). Tool *content* is never separately copied or promoted — restoring a tab remounts that tool's component, which re-reads its own already-existing `persistence.signal` values exactly as on any ordinary navigation, so a `'none'`/`'session'`-policy tool's content reappearing across a full relaunch remains exactly as impossible as it is today. The shared `<id>.workspace-step.ts` adapter (used by both Workspace mirroring and History, via the same convention-based-loader pattern `<id>.pipeline-step.ts` established in Milestone 283) deliberately carries no independent "relaunch-safe" flag, to avoid a second, driftable sensitivity judgment alongside the tool's real one. History's IndexedDB store, being `local`-equivalent in durability, inherits the identical rule, and defaults every tool to History-*ineligible* until it explicitly opts in via `historyEligible: true`. Item 4's core (Milestones 289–294: contract, proof-of-concept, tabs/panels, scratchpad, Saved Sessions, and wiring the long-dormant `PersistenceOptIn` component into `python-playground`) shipped as a complete, standalone unit before Item 5's mechanical retrofit (Milestones 295–297) began — Saved Sessions' actual relaunch value never depended on the retrofit at all, since layout restore only needs route ids every tool already has via the registry.

---

**Browser/native capability boundary.** A large and genuinely useful category of developer tools — live networking, live DNS/TLS, arbitrary filesystem operations, Windows-native system tools, local listening servers, and live database connections — is simply unreachable from a sandboxed browser tab. Phase 8 provides the shipped desktop foundation for those capabilities. Phase 27 shipped the first of these (network diagnostics); Phases 28–34 are the authoritative native-capability roadmap for the rest, with per-capability web/desktop availability and shared-core reuse instead of a separate product hierarchy.

---

## Phase 22 — Platform Hardening, Trust & Desktop-First Pivot (✅ Complete — shipped as Milestones 300–307: distributed tool manifests + registry codegen, ToolShell single-source-of-truth migration, registry structural validation + conformance harness, generated tool catalog documentation, shared-logic boundary audit, dependency boundary validation via ESLint, chunk/offline-cache budgeting, architecture documentation refresh)

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

---

## Phase 23 — Correctness, Verification & High-Consequence Tool Hardening (Complete: 277/277 manifests verified, 0 blocked; Phase 23 evidence and exceptions in `.phase23/FINAL_REPORT.md`, tool ledger in `.phase23/ledger.json`; Milestones 308-406)

DUDE now handles cryptography, authentication material, certificates, binary formats, SQL, config files, archives, executable formats, arbitrary code, filesystem operations, and eventually live system state. Those tools need a stronger definition of “stable” than “the UI appears to work.”

1. Tool Confidence Model — expand the current "stable" / "experimental" distinction into an explicit confidence model such as "experimental", "stable", and "verified", without implying formal certification. **✅ Shipped (Milestone 308)**: `ToolDefinition.status` now includes `'verified'`, with a `verification` metadata block (`vectors`/`crossChecked`/`propertyTested`/`summary`) and a conformance check requiring `summary` on any `verified` tool.

2. Published Test Vectors — cryptography, encodings, JWT/JWS/JWK, UUID variants, certificates, checksums, protocol codecs, compression formats, and standardized binary formats should use official or widely accepted test vectors where available. **✅ Rolled out (Milestones 320-406)**: 31 verified manifests record published vectors, covering representative crypto/authentication, encoding, URL/JSON, HTTP, CSV, IP, CBOR, and Protobuf standards. Exact-vector claims are omitted where published examples do not match a tool's exposed API; see `.phase23/FINAL_REPORT.md` and the tool ledger for limits.

3. Reference-Implementation Cross-Checking — selected converters/parsers are tested against independent mature implementations so DUDE is not merely proving that its encoder and decoder agree with each other. **✅ Rolled out (Milestones 320-406)**: 20 verified manifests record independent cross-checks, including SSH/PKI and executable formats against `ssh-keygen`, OpenSSL, and Python libraries; crypto, compression, and archives are also checked against independent implementations. The tool ledger records each tool's evidence and limits.

4. Property-Based Testing — round-trip-capable transformations receive generated tests such as decode(encode(x)) = x and parse(serialize(x)) preserving the documented semantics. **✅ Rolled out (Milestones 312-406)**: `fast-check` is documented in `ADDING_A_TOOL.md`; 255 verified manifests record generated property or fuzz testing suited to each tool's behavior. The ledger records the recipe and any excluded input domains.

5. Parser Fuzzing — structured-data, archive, binary, certificate, URL, expression, and config parsers receive fuzz/property testing for malformed and adversarial input. **✅ Rolled out (Milestones 313-406)**: the initial JSON/YAML/XML never-throws and typed-Result tests expanded through the tool verification rollout. Parser recipes and tool-specific limits are recorded in `.phase23/ledger.json`.

6. Golden Corpus Tests — maintain representative real-world samples for PE, ELF, Mach-O, certificates, JSON/YAML/XML, SQL, logs, Git data, archives, images, and other complex formats. **✅ Rolled out (Milestones 314-406)**: the `__fixtures__/` convention now covers PE/ELF/Mach-O, a real X.509 certificate, JSON/YAML/XML, SQLite, ZIP/TAR, and PNG. Fixture provenance and independent checks are documented alongside the samples; add further corpora as new format-specific risks arise.

7. High-Consequence Tool Matrix — explicitly identify crypto, authentication, code-execution, filesystem-write, process-management, registry, network-scanning, database-write, and secret-management tools as requiring stronger review. **✅ Shipped (Milestone 309)**: `ConsequenceClass` on `ToolDefinition`; every shipped crypto/authentication/code-execution/secret-management tool tagged. The native-capability classes were initially reserved for the tools that would use them. Phase 27 (Milestone 489) put `network-scanning` into use (Port Scanner, guided Diagnostic Bundle). It also added a tenth class, `remote-write`, for HTTP methods that can change server state (TCP/HTTP Connectivity Tester). `filesystem-write` is now used by Phase 29's previewed, journaled local file changes. `registry` and `database-write` remain reserved; `process-management` is used by Phase 28's gated packet capture.

8. Destructive-Action Harness — verify that every destructive desktop action has an explicit confirmation boundary and cannot be triggered merely by opening/importing data. **✅ Contract documented (Milestone 311)**: §5.2.1 spells out the two-step-confirm/no-incidental-trigger/tagging/test requirements. Phase 29's filesystem mutation engine now enforces plan preview, a short-lived single-use token, precondition checks, journaling and previewed undo; mutating tools have colocated confirmation-boundary tests.

9. Sandbox Regression Suite — continuously verify the Phase 6 arbitrary-code isolation assumptions and Electron "contextIsolation"/preload boundaries. **✅ Shipped (Milestones 315-406)**: real-browser Playwright tests cover opaque-origin isolation, CSP denial of unallowlisted scripts, `Worker.terminate()`'s hard stop, and Python iframe recreation; `npm run test:electron` covers the preload/path boundary and `main.ts`'s `webPreferences`.

10. Performance Regression Corpus — retain large-input fixtures and performance baselines for expensive parsers, diffs, hashing, directory operations, archive tools, and binary viewers. **✅ Shipped (Milestones 316-406)**: opt-in `perf/` (`npm run test:perf`) covers hashing, text diff, JSON, binary structures, archives, and directory comparison against procedurally generated large inputs with headroomed budgets.

11. Deterministic Test Fixtures — remove unnecessary time/network/randomness from correctness tests so failures remain reproducible. **✅ Audited (Milestone 317)**: repo-wide scan for unseeded `Math.random()`/`Date.now()`/`new Date()`; fixed the two real cases found (password-generator's separator ambiguity, qr-decode's random noise).

12. Capability-Specific Release Gates — a failure in security-critical infrastructure blocks release even if unrelated utility tests still pass. **✅ Shipped (Milestone 318)**: `scripts/check-high-consequence-gate.mjs` (`npm run test:high-consequence`) re-runs every high-consequence tool's specs as its own required, separately-labeled CI step.

13. Security Documentation Generation — derive tool network capability, persistence policy, native privileges, and external-service usage from metadata where possible. **✅ Shipped (Milestone 310)**: `scripts/generate-security-doc.mjs` generates `SECURITY.md`'s High-Consequence Tool Matrix and network/native-capability disclosure tables from manifest metadata.

14. Verified Tool Badge — optionally expose the highest-confidence status to users, with a compact explanation of what was tested rather than making vague security claims. **✅ Shipped (Milestone 319)**: `ToolShell`'s status badge shows `verification.summary` as a tooltip for any `verified` tool.

**Tool rollout status (Milestones 320-406):** all 277 tool manifests are `verified`, including the 228 tracked in `.phase23/ledger.json`; zero ledger entries are blocked. The other 49 tools were verified before that ledger was created. `verified` records internal test evidence suited to each tool, not formal certification or a claim that every tool has every test type. New tools follow `ADDING_A_TOOL.md`'s "Status & confidence tiers" checklist.

Goal: transform “vibe coded” from a correctness caveat into merely the way the first implementation happened to be produced.

---

## Phase 24 — Smart Entry, Discovery & Personal DUDE (✅ Complete — shipped as Milestones 407–420)

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

---

## Phase 25 — Desktop-First Shell & Native Product Experience (✅ Complete — shipped as Milestones 421–455)

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

---

## Phase 26 — Web Companion & PWA Efficiency (✅ Complete — shipped as Milestones 482–488)

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
---

## Phase 27 — Networking Toolkit (✅ Complete — shipped as Milestones 489–508)

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
10–15, 17. **Local Port / Active Connections / Listening Process / ARP Table / Route Table / Network Interface Viewers and Local IP Detector** — **✅ Shipped as one Local Network tool (Milestone 498)**: seven views built on read-only Windows `Get-Net*` queries and Node's interface list. It runs with current permissions first. **Relaunch as Administrator** is a deliberate action that marks the elevated session, and nothing reruns after a relaunch or a refused UAC prompt.
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

---

## Phase 28 — DNS & Live TLS / Certificate Tools (✅ Complete — shipped as Milestones 509–522)

Extend DUDE's file-based certificate inspection (Phase 12) with **live, socket-level checks against running services**. Static PEM/DER/PFX parsing stays a browser-safe workflow; this phase is the **live-endpoint layer**: deeper DNS (DNSSEC, CAA, email auth), TLS handshake and cipher inspection, chain/revocation/CT retrieval, STARTTLS, and DUDE's first background network check. Every live check reuses the Phase 27 bridge and the shared `electron/network-*.ts` clients, exposes the exact host/resolver/service contacted (§11.2, §22), and stays desktop-only with a web handoff.

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

### Notes

The certificate tools in Phase 12 operate from user-supplied PEM/DER/PFX material and stay entirely local/browser-safe. Phase 28 is the live-endpoint layer that contacts a running service, and every route inherits the standing network-disclosure rules in §11 and §22.

**Delivery notes:**
- Each tool commit ran `generate:registry`, so the sidebar, search, palette, README and SECURITY tables track the tools (fixing a Phase 27 discoverability gap).
- All eleven routes ship at `experimental` status. Trust verdicts are reported against both the bundled Mozilla roots and the Windows system store, labeled separately, so corporate/MITM roots are visible.
- Because Electron's TLS library (BoringSSL) omits many legacy suites, cipher/version enumeration reports anything it cannot offer as **"not testable from this client"**, never as unsupported.
- Cipher/version enumeration, the HTTPS Analyzer (which enumerates), and packet capture are tagged `network-scanning`/`process-management` and gated by a main-process preview and single-use confirmation. Packet capture also requires the elevated session.
- Bundled reference data (`electron/data/`: the Public Suffix List snapshot for DMARC, the CT log list) is refreshed by `scripts/refresh-network-data.mjs` and committed with its retrieval date; nothing is downloaded at runtime for those steps.
- **Still unverified (needs manual desktop testing):** the watch-list background firing, notifications and tray badge; the elevated pktmon capture and its UAC path; and how much HTTP/3 detail the Chromium net stack exposes.

**Scope amendment to Phase 27's ceiling (§21 Phase 27 Notes).** Phase 27 stated "no background or scheduled check, and no check that outlives its route." Phase 28 amends this **narrowly and explicitly**: the Certificate Watch List (items 17/24) may run background checks, but only opt-in, only while the DUDE process is alive (window open or hidden to tray), at most every 6 hours, for at most 50 endpoints, as a single TLS handshake each — no launch-on-login, no service, no OCSP/CT follow-ups in the background. Phase 28 also adds config-weakness findings (legacy versions, RC4/3DES, weak DH, missing extensions) derived from normal or enumerated handshakes; consistent with Phase 27's "not an offensive scanning platform" ceiling, **no probe triggers a server bug, reads leaked memory, or stresses the server.**

**Goal achieved:** static certificate inspection and live-endpoint troubleshooting are unified — DUDE can answer "what does this endpoint actually present, is it trusted, is it revoked, and when does it expire?" from one desktop surface, with explicit targets and bounded, mostly foreground checks.

---

## Phase 29 — Filesystem & Binary Forensics at Scale (✅ Complete — shipped as Milestones 523–536)

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

### Notes

Session folder grants remain the default; a user can explicitly remember and revoke a folder. Cancellable scans, searches and hashes run in an Electron utility process. Background watches require remembered roots and run only while DUDE is open. Per-root content capture is a separate opt-in with no size, type or secret limit; the tool shows storage usage and offers a clear action. Backups for undo default to 30 days / 5 GB and can be adjusted. Directory Diff and Git Repo Browser auto-rescan only while their views are open and the option is enabled.

Single-file inspection — hex viewing, signature/entropy analysis, MIME/magic-byte detection, BOM handling, and PE/ELF/Mach-O header viewing — remains a browser-safe/upload-driven concern and is covered by the file/binary tooling in Phase 20.

Directory Diff and Git Repo Browser already gained native re-scannable folder access in Phase 8. The distinction here is deeper **filesystem lifecycle access**: watching, streaming, searching, scanning large trees, generating manifests, and performing explicit write-back/batch mutations.

Every mutating batch operation now shows a preview with exact affected paths and requires a separate confirmation before writes. The shared engine checks preconditions, journals outcomes and supports previewed undo; deletes go to the Recycle Bin (see §5.2.1).

**Goal achieved:** DUDE's file tools now support persistent native filesystem workflows.

---

## Phase 30 — Workbench Shell, Tool Discovery, Local Insights & Appearance

Rework DUDE's primary shell surfaces so the application behaves like a dense developer workbench rather than a scrollable catalog of hundreds of tools.

Phases 24–25 already established the underlying product model: Smart Paste, Recently Used Tools, Favorites, Pinned Pipelines, Quick Run, Unified Recents, Workspace Templates, Projects, native actions, and a multi-source Command Palette are all first-class capabilities. Phases 30A–30L complete that transition visually and structurally.

The Deck/Home route must stop treating the complete tool registry as its dominant content. In the shipped default layout, the user's most likely next actions — paste/drop something, resume recent work, launch a favorite, run a workflow, reopen a project/workspace, or search — should occupy the primary viewport. The complete tool inventory remains fully accessible, searchable, keyboard-navigable, and bookmarkable through a dedicated dense browser.

The workbench redesign portion of Phase 30 starts from the current fixed dark, bright, category-colored visual system and the existing Section 8 density contract. It may refine spacing, layout, component proportions, panel treatment, and information hierarchy without depending on light mode, user-selectable density presets, font customization, theme import/export, or per-tool visual customization. Those platform-level appearance capabilities are introduced in Phase 30K; per-tool visual customization remains prohibited so the shared token/system contract stays authoritative.

### Product rule

> **Home answers "what do I want to do now?" Browse Tools answers "what does DUDE contain?"**

The complete registry must never again be the primary visual hierarchy of the Home route.

### Scope boundaries

The following appearance capabilities are now included in Phase 30K rather than treated as non-goals: light mode, accent-palette selection, user-selectable density presets, and font selection. Theme customization is included only in the controlled, token/system-driven form defined in Phase 30K; arbitrary theme customization remains out of scope.

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

Users can freely arrange first-party panels and create text, link, and shortcut panels in Phase 30I. Scriptable/third-party widget runtimes require a separate execution and permission model. Theme and density customization are defined in Phase 30K.

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

#### Exit criteria

- [ ] The sidebar no longer defaults to displaying hundreds of individual tool links.
- [ ] Ctrl+K remains the fastest universal launcher, regardless of Home layout.

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
- charts support dark-theme contrast;
- charts have text equivalents;
- chart colors retain semantic/category meaning;
- no decorative gradients/glow;
- no arbitrary per-dashboard color choices;
- tool code does not need to depend on the dashboard package.

Prefer a lightweight implementation over adding a large dashboard/chart dependency unless the dependency materially reduces complexity and remains appropriately lazy-loaded.

#### Exit criteria

- [ ] Home panels share one compact panel primitive with loading, empty, action, and keyboard states.
- [ ] Shell tables reuse or extend the shared table pattern; local insights use small token-driven charts with text equivalents.

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

#### Exit criteria

- [ ] Default Home no longer renders the complete registry as its dominant content.
- [ ] Default Home at 1920x1080 / 100% shows Smart Entry, Favorites/Recents, one resume surface or compact start-work action, and Quick Run without scrolling.
- [ ] Default Home at 1440x900 / 100% shows Smart Entry, Favorites/Recents, and one resume surface or compact start-work action without scrolling; 1366x768 remains usable without horizontal overflow.

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

#### Exit criteria

- [ ] A user can paste/drop something immediately from default Home.
- [ ] Smart Paste/file-drop behavior remains intact.

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

#### Exit criteria

- [ ] Favorites and Recently Used Tools are first-class default Home surfaces.
- [ ] Projects, Workspaces, and Pinned Pipelines are resumable from default Home where available.

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

#### Exit criteria

- [ ] Quick Run is usable from a compact default Home surface.

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

#### Exit criteria

- [ ] Default Home offers a useful local usage trend, category ranking, and at least one dense table/list.
- [ ] UsageService stores bounded 30-day daily-open buckets and tracking start without a second recorder; incomplete periods are labeled.
- [ ] Home Recent Activity displays only events with real timestamps; open workspace tabs are not shown as new activity.
- [ ] No second analytics/usage recorder exists solely for the dashboard.
- [ ] No user payload/content is recorded to produce dashboard charts.

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

#### Exit criteria

- [ ] A user can design Home in Settings from first-party and text/link/shortcut panels, using drag/resize/reorder/hide/duplicate and a keyboard/list-form editor.
- [ ] Built-in panel kinds declare typed metadata in colocated manifests; Home and Settings consume the assembled registry, and a new kind can be added without feature-specific shell branching.
- [ ] Wide-desktop and narrow placements persist independently around shared panel content, restore safely, and support Reset to Default.
- [ ] Restoring a layout or shortcut panel never executes its target; existing action confirmations remain in force.
- [ ] Custom layouts avoid horizontal overflow, unreachable controls, and blank holes from unavailable panels without enforcing the default order.
- [ ] Existing Favorites, Usage, Recents, Project, Workspace, Pipeline, and CommandSource systems remain authoritative.
- [ ] Dashboard metrics and user-authored panel content remain local; panel content participates in Clear All and backup export/import.

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

Phase 30K remains responsible for actual Density Presets and font/theme customization.

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

#### Exit criteria

- [ ] Category color is primarily structural/semantic rather than large-area decoration.
- [ ] Workbench shell changes do not prematurely couple to theming/density customization; the dedicated appearance work remains separately defined for Phase 30K.

### Phase 30K — Theming, Appearance, and Accessibility Expansion

#### 30K.1 Theming, Appearance & Accessibility Expansion

Evolve the currently fixed dark-only visual implementation into a controlled theming system without losing DUDE's dense workstation identity or allowing per-tool visual drift.

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

##### Notes

This phase intentionally changes the current design contract described in §8: today DUDE ships one dark, highly colorful theme. When Phase 30K is implemented, the change must be applied consistently to §8, shared design tokens, `AGENTS.md`, contrast/accessibility guidance, and any other living specification that still assumes one fixed theme.

Customization must remain token/system driven. Individual tools should not invent private palettes/themes that fragment category, status, focus, error, or accessibility semantics.

**Goal:** move appearance from a fixed implementation choice into a controlled platform capability without sacrificing the dense workstation identity.

#### Exit criteria

- [ ] Light Mode ships as a second, fully contrast-checked first-party theme.
- [ ] Theme customization is controlled and driven by shared design tokens rather than private per-tool palettes.
- [ ] Accent Palette Selection is available without fragmenting category, status, focus, error, or accessibility semantics.
- [ ] User-selectable Density Presets are implemented while preserving DUDE's dense workstation identity.
- [ ] Font Preferences and Editor/Data Font Selection are supported through the shared theming system.
- [ ] Reduced Motion Support is implemented.
- [ ] High-Contrast Mode is implemented.
- [ ] Better color-blind-safe semantic alternatives are implemented.
- [ ] User theme export/import is implemented.
- [ ] §8, shared design tokens, `AGENTS.md`, contrast/accessibility guidance, and any other living specification that assumed one fixed dark theme are updated consistently.

### Phase 30L — Integrated Scale, Accessibility, and Platform Verification

Run this integrated gate after Phase 30K. Verify the completed shell with representative combinations of supported themes, density and font settings, high contrast, and reduced motion, in addition to the default appearance.

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

The living Sections 9 and 27 navigation/deck contracts now distinguish:

- **Home / Workbench Dashboard** - bounded by default, personalized, action-first, and user-configurable;
- **Browse Tools** - exhaustive registry/discovery surface;
- **Sidebar** - persistent destination/category navigation;
- **Command Palette** - universal expert launcher;
- **Dedicated routes** - stable bookmarkable tool destinations.

The original V1 all-tools-on-Deck requirement remains in those sections only as a historical acceptance record. After implementation, verify that the living contract still matches the shipped navigation and update examples or screenshots that imply the complete registry belongs on Home.

#### Exit criteria

- [ ] Home and Browse Tools do not eagerly load tool implementation chunks.
- [ ] Default Home remains bounded with a synthetic 500-tool registry.
- [ ] Web companion receives the same default information hierarchy with graceful omission/substitution of desktop-only blocks.
- [ ] Focus, keyboard navigation, contrast, and existing accessibility baseline remain intact for browsing and layout editing.
- [ ] After Phase 30K, representative light/dark, density, font, high-contrast, and reduced-motion settings pass the first-frame, overflow, focus, keyboard, contrast, and responsive checks above.

### Phase 30 overall outcome

**Goal:** complete the transition from a tool deck into a true developer workbench. DUDE Home should surface the user's likely next action and current work context; Browse Tools should handle exhaustive discovery; Ctrl+K should remain the expert fast path. The application should feel denser and show substantially more useful information at normal zoom **without** becoming a smaller-font version of the same giant scroll wall.

---

## Phase 31 — Windows & Process Tools

Make DUDE genuinely useful for day-to-day Windows developer/system troubleshooting now that it has a native process and a controlled preload/IPC boundary.

1. **Environment Variable Viewer**
2. **PATH Editor**
3. **Registry Viewer**
4. **Registry Diff**
5. **Services Viewer**
6. **Process Viewer** — CPU, memory, threads, command line, environment, loaded modules, open ports, open files, parent/child relationships
7. **Process Tree**
8. **Kill Process**
9. **Restart Process**
10. **Port → Process Lookup**
11. **Windows Event Log Viewer**
12. **Scheduled Tasks Viewer**
13. **Startup Programs Viewer**
14. **Installed Software Viewer**
15. **Windows Feature Viewer**
16. **DLL Inspector**
17. **Executable Dependency Viewer**
18. **Windows SID Inspector / Account Resolver**
19. **PowerShell Command Builder + explicit execution**
20. **Environment Variable Diff**
21. **PATH Conflict Detector**
22. **Runtime Installation Detector**
23. **Process Environment Diff**
24. **Service Dependency Viewer**
25. **Event Log Filters / Saved Queries**
26. **Windows Permission / ACL Inspector**
27. **File Lock / “Who Has This Open?” Inspector**
28. **Process Diagnostic Bundle**

### Notes

Static Windows error/HRESULT decoding is reference data and remains covered by the Error Code Reference in Phase 18; a hypothetical value captured directly from a running process would be a native/runtime concern here.

Tools in this phase should be **read-first**. Any operation that changes system state — process termination/restart, PATH/environment edits, registry writes, service changes, scheduled-task changes, permission changes, or PowerShell execution — must satisfy §31's security boundaries: explicit intent, clear target, preview where practical, and an unambiguous confirmation step proportional to risk.

**Goal:** make DUDE genuinely useful for routine Windows developer/system troubleshooting without becoming a general-purpose system-administration suite.

---

## Phase 32 — Local API & Server Toolkit

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
10. **Self-Hosted/BYO Snippet Sharing Service** — user-operated, never DUDE-hosted under the current §5.2 boundary; unlike the ephemeral collaboration relay, snippets require durable storage, retention/expiry rules, share-token/access semantics, and deletion semantics
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

### Notes

Static OpenAPI/Swagger viewing, validation, diffing, and client/doc generation from an already-downloaded specification are browser-safe parsing/generation concerns. Phase 32 is specifically where **live endpoint interaction, local listening sockets, protocol clients, callback listeners, and running mock/static servers** belong.

Local servers should bind conservatively by default, clearly display bind address/port and exposure state, and require explicit user action before becoming reachable beyond loopback. Secret variables/authentication profiles inherit the secure-storage rules in §11, §22, and §30.

The snippet-sharing service follows the same self-hosted/BYO philosophy as collaboration but is **not** the same implementation or trust model as the ephemeral Yjs relay: durable snippets require persistence, deletion, retention/expiry, and access-token semantics that need their own design/security pass.

**Goal:** become a serious local-first API development surface without requiring a hosted account.

---

## Phase 33 — Database Toolkit

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

### Common explorer workflow

For relational/document database explorers where the database supports the concept: **connect → browse schemas/databases/tables/collections → inspect metadata → preview rows/documents → execute an explicit query/command → export results**.

### Notes

The read-only SQLite File Viewer in Phase 9 opens a user-selected `.sqlite` file as static content and requires no live database connection. Phase 33 is for **live database sessions** and connection profiles, including network/database drivers and transaction state.

SQL text-only operations — formatting, dialect conversion, CREATE TABLE generation, query explanation from pasted text, and similar deterministic transforms — remain separate browser-safe tools and should not require a live connection.

Write-capable actions must clearly distinguish read-only vs. mutable sessions. Import, DDL/DML, transaction commit/rollback, and other mutating operations require explicit user intent and should provide previews/row counts/transaction boundaries where practical.

**Goal:** provide the 80% of database inspection developers repeatedly need while deliberately avoiding becoming a full DBA suite.

---

## Phase 34 — Containers & Local Orchestration

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

### Notes

Phase 19 already covers static Dockerfile/Compose linting, formatting, validation, `docker run`↔Compose conversion, Kubernetes manifest validation/formatting/diffing, and kubeconfig inspection. Phase 34 is specifically the **live daemon/cluster** layer: querying runtime state, reading logs/stats/events, changing selected resource state, and managing port forwards/contexts.

Mutating daemon/cluster operations must display the target context/namespace/resource prominently and require explicit confirmation for destructive or state-changing actions.

**Goal:** stay a lightweight developer diagnostics companion rather than competing directly with Docker Desktop or dedicated Kubernetes platforms.

---

## Phase 35 — System Diagnostics, Clipboard & OS Integration

Create the “why doesn't this work on my machine?” surface and the native conveniences that make DUDE feel like part of the operating system rather than a website contained in one window.

1. **System Information Dashboard** — OS, architecture, CPU, RAM, GPU, disks, network adapters, monitors, installed runtimes, hostname, logged-in user, uptime, and virtualization status
2. **Export Diagnostic Bundle** — one explicit action packages the selected diagnostic information for a bug/support report
3. **Clipboard History**
4. **Clipboard Monitor** — continuous monitoring, for example detecting/optionally offering to format copied JSON
5. **Screen Ruler**
6. **Live Pixel Color Picker** — screen-coordinate based, distinct from Phase 17's upload-image Pixel Color Picker
7. **Context-Menu Actions** — e.g. “Hash file,” “Format JSON” as new Explorer right-click entries (distinct from “Open with DUDE,” already available today via Phase 25's File Association Framework, which registers DUDE as an Explorer “Open with” candidate per file extension)
8. **Global Keyboard Shortcuts** — system-wide, not merely in-app (three fixed global hotkeys already exist and are independently rebindable: Phase 8 Stage 5's clipboard quick-actions, Phase 24's Smart Paste hotkey, and Phase 25's Quick Launcher hotkey; this item is about arbitrary user-defined global bindings beyond those three)
9. **System Tray Presence and Actions** — already shipped in Phase 8 Stage 5 (`electron/tray.ts`); nothing left here unless a later item needs new tray behavior
10. **Drag-and-Drop File Handling / “Open With” Integration** — in-window drop routing and Explorer “Open with” both already shipped (Phase 25 items 8–9); what remains is OS-shell-level drop targets (e.g. dropping a file onto DUDE's taskbar/desktop icon to launch-and-open, rather than dropping into an already-open window)
11. **Batch Processing Across Dropped Files**
12. **Multi-Window Workflows** — multiple DUDE windows/process-backed windows as genuine OS/window-management behavior, distinct from Phase 21's in-app tabs/panels
13. **Local Secrets Vault** — general-purpose local secrets management built on the `secure-local`/OS-keychain tier shipped in Phase 8 Stage 3; not a hosted secret-storage service
14. **Developer Environment Inspector** — installed Git/Node/Python/Java/.NET/Docker/PowerShell/Go/Rust versions and other relevant developer-runtime state
15. **Runtime Version Conflict Detector** — including multiple-runtime/PATH conflicts
16. **Disk Space / Mount Inspector**
17. **Monitor/DPI Inspector**
18. **Default Application Inspector**
19. **Clipboard Rules**
20. **Global Quick Transform Palette**
21. **Native Notification Center**
22. **User-configurable native action bindings**

### Notes

One-shot clipboard read/write — such as a tool's Copy button — already works in the web companion. Clipboard **history** and **continuous background monitoring** require native/background capability and belong here.

Saved Sessions remain a Phase 21 workspace/session-persistence capability; they are not OS/tray integration. Likewise, native file-watch automation is developed further in Phase 40 rather than being hidden inside this phase.

The Local Secrets Vault must reuse the secure credential boundary rather than inventing plaintext/localStorage persistence. Native quick actions and clipboard rules must remain explicit about whether they merely inspect/transform clipboard content or perform a system action.

**Goal:** make DUDE feel integrated into the operating system rather than contained inside a single application window.

---

## Phase 36 — AI-Assisted Utilities

Phase 8 Stage 4 already shipped the localhost-only, provider-agnostic LLM proxy plus AI regex generation/explanation. Phase 36 uses that established explicit AI path for interpretation/debugging tasks where an LLM materially reduces effort, without turning deterministic utilities into LLM wrappers.

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

### Notes

Desktop dependency here is about the currently shipped **local LLM proxy/credential boundary**, not about native sockets/filesystem/process access. Where a capability can later run through Phase 69's on-device model runtime, the same AI feature should be able to stay fully local.

Non-AI deterministic/heuristic alternatives remain valuable and should coexist where they already exist: e.g. the heuristic Regex Generator in Phase 16, static Stack Trace Formatters in Phase 18, and the rule-based Cron parser.

AI actions must be user-initiated or explicitly configured, must respect the no-silent-transmission boundary, and must never silently replace a deterministic implementation that can provide an exact answer.

**Goal:** apply AI where it meaningfully reduces interpretation/debugging effort without turning every deterministic utility into an LLM wrapper.

---


## Phase 37 — VS Code Integration

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

### Notes

This is a separate distribution/integration target, not merely another Angular tool. It needs its own packaging, permissions, lifecycle, compatibility, and release design.

The architecture is supported by existing precedent: most deterministic tool logic is framework-free/unit-testable, and Phase 8 Stage 5 established `src/shared-logic/` specifically so non-Angular runtimes can reuse transforms. Phase 22 expands that boundary, and the parity invariant in §33 requires shared semantics not to fork.

**Goal:** bring DUDE's most useful deterministic transformations to where developers already spend much of their time.

---

## Phase 38 — Browser Extension

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

### Notes

The browser extension is intentionally separate from the VS Code extension because their host APIs, lifecycle, packaging, permission models, and security boundaries are materially different. Their commonality should be the shared DUDE transform/workflow core, not a forced shared host implementation.

Permissions must be requested narrowly and justified by a concrete feature. Page content, headers, cookies, clipboard data, or selections must not be collected or transmitted silently.

**Goal:** reduce the friction between browser debugging and the full DUDE workbench.

---

## Phase 39 — Cross-Platform Desktop

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

---

## Phase 40 — Filesystem Automation & Watch Rules

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

**Phase 29 foundation and remaining scope:** Phase 29 shipped remembered-folder grants, recursive watching, event coalescing, root-level exclusions, a timeline, notifications and a previewed mutation engine. The 12 items above remain the Phase 40 roadmap for rule-driven behavior: rules still need their own triggers, debounce and ignore settings, conflict handling, dry-run review, history, notification settings and permissions. A watch event by itself does not authorize a write; Phase 40 must define how automatic actions meet §5.2.1 or an explicitly specified standing authorization contract without silently overwriting work.

Goal: turn the file-watch infrastructure into useful automation without surprising users or overwriting work silently.

---

## Phase 41 — Git Workstation

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

---

## Phase 42 — SSH & Remote Systems

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

---

## Phase 43 — Local Development Services Manager

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

---

## Phase 44 — Package & Dependency Workbench

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

---

## Phase 45 — Build & Test Intelligence

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

---

## Phase 46 — Logs & Observability Workbench

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

---

## Phase 47 — HTTP Debugging Proxy

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

---

## Phase 48 — Advanced Database Workflows

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

---

## Phase 49 — Advanced Containers

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

---

## Phase 50 — Kubernetes & Cloud-Native Workbench

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

---

## Phase 51 — Secrets & Credential Workbench

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

---

## Phase 52 — PKI & Certificate Workbench

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

---

## Phase 53 — Collaboration 2.0

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

---

## Phase 54 — Workspace 2.0

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

---

## Phase 55 — Pipeline 2.0: Graph Workflows

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

---

## Phase 56 — Local Plugin SDK

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

---

## Phase 57 — Signed Extension Marketplace

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

---

## Phase 58 — Workflow & Template Gallery

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

---

## Phase 59 — Browser ↔ Desktop Handoff

1. Open web tool state in desktop
2. Open selected browser content in desktop
3. Safe ephemeral handoff tokens
4. File handoff where browser permissions allow
5. URL handoff
6. Pipeline handoff
7. Workspace-template handoff
8. Return generated result to invoking browser extension where explicitly authorized

Phase 26 already shipped navigation-only Open in Desktop links. Phase 59 owns state, file, token, result, and cross-surface workflow handoff. Goal: make web, extension, and desktop surfaces feel like one product.

---

## Phase 60 — DUDE CLI

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

---

## Phase 61 — Headless Automation

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

---

## Phase 62 — Local SDK & Automation API

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

---

## Phase 63 — IDE Ecosystem

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

---

## Phase 64 — Source Hosting Integrations

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

---

## Phase 65 — Developer Task Context

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

---

## Phase 66 — Monitoring & Watchers

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

---

## Phase 67 — Unified Local Search & Index

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

---

## Phase 68 — Developer Knowledge Workbench

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

---

## Phase 69 — On-Device AI

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

---

## Phase 70 — AI Workflow Assistant

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

---

## Phase 71 — Agentic Developer Workflows

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

---

## Phase 72 — Project Workspaces

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

---

## Phase 73 — Static Code Intelligence

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

---

## Phase 74 — Refactoring & Code Transformation Workbench

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

---

## Phase 75 — Profiling & Runtime Diagnostics

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

---

## Phase 76 — Integrated Terminal & Shell Workflows

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

---

### Workbench identity gate before editor/IDE-like phases

Phases 77–80 are preserved exactly as a long-horizon expansion of DUDE, but they do **not** authorize turning the product into a conventional VS Code clone. Editor/LSP/terminal/project surfaces must remain subordinate to DUDE's broader artifact/problem/workflow model and its deterministic utility core.

## Phase 77 — Code Editor Surface

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

---

## Phase 78 — Language Services

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

---

## Phase 79 — Development Environment Manager

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

---

## Phase 80 — Integrated Developer Workspace

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

---

### Conditional hosted-cloud / account horizon gate

The source suggestions intentionally explore optional accounts, sync, hosted collaboration, hosted extension infrastructure, and paid hosted services in Phases 81–95. Those details are preserved below, but under the current durable boundary in §5.2 they are **conditional alternative-horizon concepts, not authorized product direction**. They may proceed only if a later explicit PRD decision reverses the “no DUDE-operated hosted cloud” boundary. Self-hosted, BYO, user-owned remote infrastructure, and on-prem equivalents remain compatible with the current direction.

## Phase 81 — Optional Account & Identity Foundation

The original “no user accounts” decision is no longer permanent at this horizon.

1. DUDE remains fully usable locally without login.
2. Account creation is optional.
3. Device identity
4. Session management
5. Recovery strategy
6. No account requirement for basic tools
7. Local-only mode remains first-class

Goal: create the minimum identity layer needed for optional cross-device services without converting DUDE into an account-first SaaS product.

---

## Phase 82 — End-to-End Encrypted Sync

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

---

## Phase 83 — Cross-Device Workspace Continuity

1. Resume workspace on another device
2. Synced layouts
3. Synced pipeline definitions
4. Synced project references where meaningful
5. Missing-file handling
6. Platform-capability adaptation
7. Desktop/web handoff
8. Device presence

Goal: allow the workbench to follow the developer without pretending every device exposes identical capabilities.

---

## Phase 84 — Hosted Collaboration Service

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

---

## Phase 85 — Teams & Organizations

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

---

## Phase 86 — Enterprise Security & Policy

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

---

## Phase 87 — Hosted Extension Ecosystem

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

---

## Phase 88 — Secure Remote Execution

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

---

## Phase 89 — Remote Development Workspaces

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

---

## Phase 90 — Hybrid Local/Cloud Execution Planner

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

---

## Phase 91 — Mobile Companion

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

---

## Phase 92 — Universal Web Platform

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

---

## Phase 93 — Privacy-Preserving Product Insights

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

---

## Phase 94 — Internationalization & Accessibility Maturity

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

---

## Phase 95 — Sustainable Commercial Model

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

---

## Phase 96 — Self-Hosted / On-Premises DUDE Platform

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

---

## Phase 97 — Public DUDE Platform SDK

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

---

## Phase 98 — Third-Party DUDE Applications

1. Build standalone apps using DUDE core
2. Embed DUDE tool surfaces
3. Embed pipeline runtime
4. Custom enterprise distributions
5. Domain-specific DUDE workbenches
6. Branded/self-hosted deployments
7. Shared component packages
8. Shared transform packages

Goal: let DUDE's architecture become infrastructure other software can build upon rather than only an application.

---

## Phase 99 — Federated Developer Workbench Ecosystem

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

---

## Phase 100 — DUDE Developer Operating Environment

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

---

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

«DUDE Desktop is the canonical, complete developer workbench. DUDE Web is its zero-install, browser-safe companion. Shared capabilities use the same core implementation wherever the platform allows it.»

## Roadmap Sequencing Rationale

The progression is deliberate. Phases 22–26 slow raw feature accumulation to decompose registry/metadata debt, strengthen correctness and release confidence, improve discovery, mature the desktop shell, and harden the web companion before DUDE adds significantly more native power.

Phases 27–38 then form a coherent native/integration expansion; Phase 27 (networking) has shipped. Their authoritative text is intentionally self-contained: each phase states the static/browser-safe capabilities it complements, the live/native boundary it crosses, the relevant safety rules, and the full feature scope. No phase in this range depends on an obsolete numbering scheme or an archived roadmap definition to explain what it means.

The longer progression remains: 39–55 deepen the interconnected workbench; 56–68 turn DUDE into an extensible automation platform; 69–80 move into AI/project/IDE-adjacent territory under the workbench-identity gate; 81–96 preserve a conditional cloud/team/commercial horizon behind explicit product-boundary gates; and 97–100 describe DUDE as a platform/ecosystem.

Phase 100 provides the intentionally extreme long-horizon endpoint without allowing distant architecture to contaminate the concrete decisions that should be made in Phase 22.

### Desktop-platform continuity

The remaining desktop-platform work is explicitly assigned within the current roadmap rather than left in an unnumbered backlog:

- macOS/Linux desktop builds, platform keychains, native packaging, and signed non-Store Windows distribution — **Phase 39**;
- file-watch-driven automation and safe write workflows — **Phase 40** (read-only auto-rescan shipped in Phase 29);
- named/accountless collaboration and richer self-hosted relay behavior — **Phase 53**;
- broader local/on-device model support and AI routing — **Phases 69–71**.

## Commercialization Policy and Historical Context

Basic local utilities remain free under §5.2. Phase 95 contains the commercial horizon, but under the current no-DUDE-hosted-cloud direction only local, self-hosted, on-premises, support, packaging, or other non-hosted commercial models are presently compatible without another explicit product decision. No future business model may remove formerly-local functionality merely to manufacture a subscription.

Appendix D records the non-authoritative monetization sketch without changing these standing boundaries.

---

# 22. API Integration Architecture

Network integrations are allowed when they are integral to a tool or workflow, but local execution remains the default whenever practical.

User-supplied API keys are the default credential model for external services. Desktop DUDE may also use OS-level secure storage, local provider configuration, or self-hosted/on-prem credentials where appropriate.

## 22.1 Rules

- No static private secrets in source control or compiled distributions.
- No DUDE-operated cloud proxy is part of the current architecture/product direction.
- A **local bundled proxy/backend** is allowed and already shipped where browser restrictions or credential isolation make it necessary (for example Phase 8 Stage 4's localhost-only LLM proxy).
- User-owned/self-hosted relays, servers, and remote runners are allowed when the user explicitly configures them.
- Network activity, persistence behavior, platform/native capabilities, and external-data boundaries must be represented in canonical tool/capability metadata and remain consumable by shell-level disclosure UI rather than being buried only inside individual tool implementations.

Each API-backed tool should declare:

- external service name;
- whether network is required;
- whether an API key/credential is required;
- how the credential is stored;
- what user input is transmitted;
- whether data leaves the machine directly, through a local proxy, or through explicitly configured user-owned infrastructure;
- what happens offline;
- desktop/web availability;
- any destructive or privileged actions exposed by the integration.

## 22.2 Default key storage

Default for browser-capable API tools:

- session-only.

Optional:

- explicit user opt-in to local persistence for non-sensitive configuration;
- desktop `secure-local` / OS-keychain-backed storage for secrets;
- named local secret references once Phase 51 expands the secrets workbench.

Never:

- hard-coded secret;
- silent persistent secret storage;
- **downgrading a secret from `secure-local` / OS-backed storage into ordinary local storage merely for implementation convenience**;
- silent transmission to a third-party service;
- plaintext automatic synchronization of secrets.

---

# 23. Suggested Repository Architecture

Exact naming may evolve, but keep the separation of responsibilities and the **shared-core rule**. The repository should not fork into unrelated web and desktop implementations.

A directionally appropriate post-Phase-22 shape is:

```text
src/
  app/
    core/
      registry/
        manifests/
        validation/
      persistence/
      workers/
      network/
      routing/
      errors/
      history/
      workspace/
      pipelines/
      paste-detect/
      platform/
    shell/
      layout/
      sidebar/
      deck/
      command-palette/
      search/
      smart-paste/
      workspace/
      history/
      pipelines/
    shared/
      components/
      directives/
      pipes/
      utilities/
      models/
    tools/
      <category-or-tool>/
        <tool>.tool.ts
        <tool>.component.ts
        <tool>.component.html
        <tool>.component.css
        <tool>.logic.ts
        <tool>.pipeline-step.ts
        <tool>.workspace-step.ts
        <tool>.worker.ts
        <tool>.spec.ts
  shared-logic/
    # framework-neutral transforms/codecs reused by Angular, Electron,
    # CLI, extensions, tests, SDKs, and later integrations

electron/
  # main process, preload, native adapters, local services

relay/
  # user-self-hosted collaboration relay shipped in Phase 8

cli/                 # future Phase 60+
sdk/                 # future Phase 62/97+
extensions/          # future VS Code/browser/IDE/plugin work
```

The original V1 architectural shape — `core/`, `shell/`, `shared/`, and `tools/` under Angular — remains valid and is preserved by this expansion. Not every tool needs every file. Avoid ceremony for small utilities.

### 23.1 Distributed manifests and metadata ownership

Phase 22 should retire the multi-thousand-line monolithic `TOOL_DEFINITIONS` maintenance pattern in favor of tool-local or category-local manifests composed at build time. A tool owns its metadata beside its implementation. The registry remains the runtime authority, but it is assembled rather than hand-edited as one giant file.

### 23.2 Platform adapters

Phase 8 already proved the platform-adapter direction. Browser APIs and Electron/native APIs should implement narrow interfaces behind `PlatformService`/native bridges rather than causing duplicated tool implementations.

The renderer keeps `contextIsolation`; no direct Node access is introduced for convenience. Native behavior goes through preload/IPC or other explicitly reviewed adapters.

### 23.3 Shared logic

`src/shared-logic/` was established in Phase 8 Stage 5 when Base64/hash logic needed reuse by Electron shell actions. Phase 22 broadens that precedent: if logic can reasonably be framework-neutral, it should be extractable and testable outside Angular so CLI, IDE extensions, browser extensions, SDKs, workers, Electron, and tests can reuse the same implementation.

---

# 24. Suggested Tool Definition Pattern

A tool should be close to self-registering and should own its canonical metadata beside its implementation.

Conceptual example:

```ts
export const JSON_TOOL: ToolDefinition = {
  id: 'json',
  title: 'JSON Formatter',
  description: 'Validate, format, and minify JSON.',
  category: 'data',
  keywords: ['json', 'format', 'validate', 'pretty', 'minify'],
  route: '/tools/json',
  load: () => import('./json.component'),
  persistence: {
    input: 'none',
    preferences: 'local'
  },
  execution: {
    worker: 'optional'
  },
  network: {
    required: false
  },
  io: {
    accepts: ['text', 'json'],
    produces: ['text', 'json', 'file']
  },
  platforms: {
    web: true,
    desktop: true
  },
  status: 'stable'
};
```

The shell, routes, ToolShell, search, command palette, platform-capability indicators, generated documentation, pipeline/workspace adapters, privacy/network disclosures, and confidence badges should consume this canonical metadata rather than importing tool-specific behavior or repeating titles/status fields at call sites.

Phase 22 adds structural validation and distributed manifests. Phase 23 expands the status model from the historical `stable | experimental` distinction to include a carefully-defined `verified` tier without implying external certification.

---

# 25. Shared Services

## 25.1 Tool Registry Service

Responsibilities:

- expose tool definitions;
- category grouping;
- keyword search;
- route lookup;
- stable IDs;
- duplicate validation in development.

## 25.2 Persistence Service

Responsibilities:

- namespace data by tool;
- support session/local/nonpersistent policy;
- explicit handling of sensitive values;
- serialize preferences;
- clear tool state;
- clear all DUDE state.

## 25.3 Worker Service

Responsibilities:

- start work;
- cancel work;
- normalize error handling;
- terminate failed jobs;
- expose busy state.

## 25.4 Connectivity Service

Responsibilities:

- current online/offline signal;
- tool-level network status;
- compact offline UI support.

## 25.5 Search Service

Responsibilities:

- title matching;
- keyword matching;
- category matching;
- ranking exact/prefix matches ahead of loose matches.

Do not overbuild search.

A straightforward in-memory search is sufficient.

## 25.6 Platform Service

Added in §21 Phase 8 Stage 1 as the seam every desktop-only stage conditions on. Responsibilities:

- detect the Electron desktop shell via the flag `electron/preload.ts` injects through `contextBridge` — never `navigator.userAgent` sniffing;
- expose the result as a readonly `isDesktop` signal, same shape as the Connectivity Service's `online` signal;
- stay tool-agnostic — a boolean primitive the shell or any tool can read, never a place for desktop-feature logic itself.

**✅ Extended in Phase 25** (Milestone 448, crash/restart recovery): gained a second static, preload-computed flag, `wasRestoredAfterCrash` — true only for the one launch immediately following an unclean exit — read once at construction the same way `isDesktop` already is.

---

## 25.7 Metadata / Manifest Validation

Phase 22 adds build/CI validation for unique IDs/routes, valid categories, I/O declarations, persistence compatibility, pipeline/workspace adapters, lazy-loader existence, confidence/status values, platform availability, capability declarations, and documentation metadata.

**✅ Updated in Phase 26 (Milestone 482):** the conformance harness validates the closed `capabilities` platform/runtime vocabulary against actual native-service imports and runtime references. `desktopCapabilities` was removed.

## 25.8 Capability / Permission Service

**✅ Platform capability catalog shipped (Milestone 482):** tool manifests declare native features and optional runtimes through a closed vocabulary; registry helpers, generated docs, badges, offline readiness, and pipeline gating consume it. This describes availability, not permission to execute an action. A broader permission service for future native, remote, plugin, and automation operations remains roadmap work; user intent and destructive-action confirmation still gate execution.

## 25.9 Local Usage / Recents Service

**✅ Shipped in Phase 24** (Milestones 407–419): `core/usage/UsageService` (frequency + recents), `core/favorites/FavoritesService` (tools + pipelines), `core/suggestions/` (related-tool + pipeline suggestions), and `core/recents/UnifiedRecentsService` (a derived, read-only merge — never a fifth recording mechanism). All private-by-construction: no analytics, no remote telemetry, mechanically audited in Milestone 420.

## 25.10 Desktop Native-Service Boundary

Electron preload/main-process services expose narrowly-scoped native primitives. Tool code should not gain broad Node/native access simply because it runs in the desktop product. The permission/capability surface should remain inspectable and testable.

**Upheld through Phase 25**: every new preload/IPC surface that phase added (deep-link forwarding, the registry-driven native-menu snapshot, Quick Launcher hotkey/geometry control, the `dude:open:reopen`/`dude:open:enqueuePath` handlers, the crash-detection flag) stays a narrowly-scoped primitive validated on the main-process side, never a broad capability handed to the renderer wholesale.

---

# 26. Command Palette Requirements

The command palette currently supports navigation only.

## Required

- open by keyboard;
- search tools;
- arrow-key selection;
- Enter to navigate;
- Escape to close;
- auto-focus search input.

## Historical V1 Deferred Items / Later Roadmap

The V1 palette was navigation-only. The following were deliberately deferred then:

- tool actions;
- configurable shortcuts;
- nested commands;
- command aliases managed by users;
- macros.

**✅ Shipped in Phase 25** (Milestones 423–424, 441–443): the proposed palette expansion, via a declared `CommandSource`/`COMMAND_SOURCE` multi-provider contract rather than hard-coded shell branches — tools, workspace templates, projects, pipelines (navigate-only), native operations, recent activity, and preferences all share one launcher today. Extension commands remain out of scope until a plugin loader exists; later plugin/IDE/automation phases can add commands through that same declared `CommandSource` API rather than a new mechanism.

---

# 27. Deck Requirements

The Phase 30D Home workbench should be useful, dense, and bounded in its default layout.

Required:

- immediate Smart Entry/paste/drop;
- personalized launch and resume surfaces using existing authoritative stores;
- compact Quick Run access;
- a clear route to Browse Tools;
- keyboard-compatible actions and links;
- a configurable Home layout under Phase 30I.

Under Phase 30A/30D, the complete registered tool inventory belongs to Browse Tools, not to Home's default content. Home may show bounded category/tool previews and user-selected discovery panels. Direct tool routes remain stable.

For the original V1 Deck, all registered tools were required on the Deck and recently used/favorite tools were optional unless trivial. That remains a historical acceptance record. Phase 24 made personalization first-class; Phase 30D replaces the V1 Deck composition when implemented.

---

# 28. Tool UX Conventions

Common keyboard and action patterns should be reused where helpful.

Recommended conventions:

- `Ctrl+Enter`: run/execute where a run step exists;
- `Ctrl+K`: command palette;
- copy buttons use consistent placement;
- clear/reset uses consistent placement;
- errors appear close to the relevant input;
- success notifications are subtle;
- avoid modal dialogs for routine tool interactions.

Keyboard shortcuts should never block core browser shortcuts unnecessarily.

---

# 29. Large Inputs

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

---

# 30. Sensitive Inputs

Sensitive inputs are allowed.

The product should not block JWTs, credentials, private JSON, or similar data merely because they may be sensitive.

The framework should instead behave responsibly:

- no silent persistence by default;
- no silent network transmission;
- API-backed tools make transmission explicit;
- sensitive tools choose safer persistence defaults.

No enterprise secret-management system was in the original V1 scope. Desktop `secure-local` storage has since shipped, Phase 35/51 expands the local secrets experience, and distant enterprise/on-prem integrations may exist later. None of those changes the rule against silent persistence/transmission or plaintext automatic sync.

---

# 31. Security Boundaries

## Standing rules

- no arbitrary code execution **in DUDE's own renderer/app realm** — arbitrary execution is permitted only inside an explicitly sandboxed environment such as the opaque-origin iframe/worker infrastructure from Phase 6, a future constrained plugin runtime, or another reviewed isolation boundary;
- no untrusted remote plugin/extension code receives DUDE/Desktop/native privileges merely because it was installed — future plugin/marketplace work requires manifests, capability declarations, permission display, signing/review metadata where applicable, sandboxing where possible, and a strict distinction between sandboxed vs. native-capability extensions;
- no untrusted HTML execution without sanitization outside an explicit sandbox;
- no embedded private service credentials;
- no silent user-data transmission;
- no destructive or privileged operation triggered merely by opening/importing content;
- no native operation bypassing Electron's preload/IPC boundary for convenience;
- no unauthenticated general-purpose local automation/control endpoint;
- no claims that JWT decoding verifies authenticity;
- network interception, proxies, remote commands, registry/service/process/database/container/Kubernetes mutations, automation triggers, and agentic actions must expose conspicuous state/permission/confirmation boundaries appropriate to their risk.

Phase 6's sandbox design (iframe isolation, network egress blocked via CSP, hard execution timeouts) is documented in `src/app/shared/code-sandbox/code-sandbox-doc.ts` and each Phase 6 tool's own sandbox file.

Phase 8 Stage 1 applies these standing rules to the Electron renderer (`contextIsolation` on, no `nodeIntegration`, all native access preload-mediated) and to the bundled local static server (`127.0.0.1` only, OS-assigned port). Stage 6's LAN collaboration server is the deliberate exception to loopback-only binding and is protected by session-code semantics documented in the Phase 8 record.

Phase 22 adds dependency-boundary validation and conformance checks. Phase 23 adds destructive-action and sandbox regression suites plus security-sensitive release gates. Later plugin, automation, HTTP proxy, SSH/remote, and agentic phases inherit these boundaries rather than weakening them.

---

# 32. Performance Strategy

Performance work should remain pragmatic, but desktop scale, hundreds of tools, large runtimes, and PWA cache growth now justify explicit budgets.

## Required

- route-level lazy loading;
- reusable worker abstraction;
- avoid loading heavy tool libraries before the tool is visited;
- avoid re-rendering the entire shell during tool-local state changes where practical;
- keep navigation responsive;
- measure cold/warm desktop startup where native services are involved;
- stream or lazily inspect large files/directories where practical instead of eagerly buffering by default;
- keep optional runtimes (WASM, Pyodide, local models, language services, etc.) out of the critical startup path;
- map built tool chunks and runtimes to offline readiness, and let users pre-cache them with a size preview.

## Phase 22 hardening requirements

- warning/error budgets for individual lazy chunks, major shared chunks, startup code, desktop preload code, and large WASM/runtime payloads;
- total offline Cache Storage budgeting, not merely initial JS size;
- service-worker strategy audit so generic `*.js` matching does not accidentally prefetch every lazy tool/runtime;
- dependency-boundary validation to stop large or platform-specific packages leaking into shared startup bundles;
- shipped web-cache repair/clear tooling (Phase 26, Milestone 483).

## Still pragmatic / not raw-goal driven

- no requirement to minimize every byte at the expense of maintainability;
- no micro-benchmark for every simple tool;
- no manual tree-shaking campaign without evidence;
- no custom virtualized editor unless a concrete tool/workload needs it.

Phase 23 adds performance regression corpora for expensive parsers, diffs, hashing, directory operations, archives, and binary viewers where regressions would be user-visible.

---

# 33. Build and Deployment

DUDE now has two first-class distribution pipelines with an explicit hierarchy: **desktop is canonical; web is the zero-install companion.**

## 33.1 Shared build requirements

- framework-critical tests run before release artifacts are accepted;
- shared transformation/core logic is built once per target rather than reimplemented;
- platform boundaries prevent Electron/Node-only dependencies from contaminating browser bundles;
- capability/security-critical release gates may become stricter than general utility-tool gates under Phase 23.

## 33.2 Windows desktop production build and release

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

### Desktop release acceptance

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

These checks are release invariants, not merely historical Phase 8 implementation notes. Higher-risk later capabilities may add stricter gates under Phases 22–23 and §31.

## 33.3 Web companion production build

A documented build must create production-ready static assets for GitHub Pages/PWA delivery.

CI should:

1. install dependencies;
2. run framework-critical tests, including registry-wide web/desktop parity;
3. build the production web app, generate its offline map, and check cache budget and asset-group coverage;
4. prepare the GitHub Pages SPA fallback;
5. publish static output.

### Web companion / GitHub Pages acceptance

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

## 33.4 Shared-core web/desktop parity — permanent build invariant

Whenever the same capability is declared available on both DUDE Desktop and DUDE Web, automated parity coverage should verify that the shared transformation/domain semantics remain equivalent. Platform adapters, file pickers, storage backends, native bridges, and shell presentation may legitimately differ; the deterministic operation must not silently fork into two incompatible implementations.

Phase 26 shipped registry-wide pipeline parity and web/native adapter parity for every declared fallback (Milestone 487). The rule is permanent: **shared capabilities must continue to use the same core implementation and parity contract in subsequent releases.** A platform-specific implementation is acceptable only where the platform genuinely requires different behavior, and that difference must be explicit in capability metadata/tests rather than accidental drift.

## 33.5 Future distribution

Phase 39 adds macOS/Linux packaging and signed non-Store distribution. Later CLI/extensions/SDKs get their own release channels without duplicating core logic.

---

# 34. Documentation Deliverables

`README.md` and `ADDING_A_TOOL.md` exist today, but Phase 22 turns documentation into a partially generated contract rather than a manually drifting inventory.

## README

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

## `ADDING_A_TOOL.md`

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

## Additional living documentation

Phase 22 explicitly refreshes `AGENTS.md`, security documentation, platform documentation, cache/bundle strategy, and architecture notes so they describe the actual post-Phase-21/post-desktop system rather than accumulating contradictory amendments.

---

# 35. Definition of Done

DUDE V1 was declared done once all required items below were verified true, on 2026-09-19.

## Product

- [x] App is called DUDE.
- [x] Dark-only, highly colorful (bold accent palette), dense developer UI is implemented.
- [x] Category color-coding and semantic status colors (Section 8.5) are consistent across sidebar, deck, and tools. Verified: `src/styles/tokens.css` defines the palette once; sidebar/deck/command palette all derive category dots from `CATEGORY_METADATA` dynamically (no hard-coded colors per tool); `ErrorPanel`/`OfflineBadge` use the shared semantic tokens.
- [x] Deck exists.
- [x] Sidebar exists.
- [x] Global search exists.
- [x] Command palette exists.
- [x] Every MVP tool has a dedicated route.

## Architecture

- [x] Typed tool registry exists.
- [x] Shell is generated from tool metadata where practical. Verified: no shell file contains a hard-coded tool-id conditional (grepped `src/app/shell/`); sidebar, deck, command palette, and routes all iterate `TOOL_DEFINITIONS`/`ToolRegistryService`.
- [x] Per-tool persistence policy exists.
- [x] Shared worker execution path exists.
- [x] Online/offline state exists.
- [x] Tool failures do not disable shell navigation. Verified directly by `src/app/app.spec.ts`'s "a worker failure on a real tool does not break shell navigation" test.
- [x] Heavy tool routes are lazy-loaded.

## PWA

- [x] Manifest exists.
- [x] Service worker exists.
- [x] App is installable. Verified live at `https://arahman200165.github.io/DUDE/manifest.webmanifest` — valid `standalone` manifest with a full icon set (72–512px) plus an active service worker.
- [x] Shell works offline after first load.
- [x] Local-only tools remain usable offline.

## Deployment

- [x] Production build succeeds.
- [x] CI deployment works. Verified: latest `Deploy` GitHub Actions run for the Milestone 10 push completed successfully.
- [x] GitHub Pages site loads. Verified live: `https://arahman200165.github.io/DUDE/` returns HTTP 200.
- [x] Nested tool URLs work. Verified live and via `e2e/production-direct-route.spec.ts`.
- [x] Refresh on nested routes works. Same SPA-fallback mechanism, exercised by `e2e/pwa-offline.spec.ts`'s `page.reload()`.
- [x] Asset base path works. Verified live: `manifest.webmanifest` and `ngsw.json` both resolve correctly under the `/DUDE/` prefix.

## Tools

- [x] JSON Formatter / Validator
- [x] Regex Tester
- [x] Unix Timestamp Converter
- [x] Base64 Encoder / Decoder
- [x] Markdown Preview
- [x] JWT Debugger
- [x] Text Inspector
- [x] Hash Generator
- [x] Text Diff
- [x] UUID Generator / Inspector — shipped early as the extension-speed proof (§3.1.A, §20).

## Documentation

- [x] README exists. Rewritten to cover project purpose, screenshots, the full tools table, architecture summary, tech stack, and GitHub Pages deployment mechanics.
- [x] `ADDING_A_TOOL.md` exists.
- [x] architecture is understandable from repository structure and docs. Satisfied via `ADDING_A_TOOL.md`, the rewritten README's architecture section, and the self-descriptive `core/`/`shell/`/`shared/`/`tools/` layout.

## Validation

- [x] framework-critical tests pass. 176/176 via a fresh `npm test` run.
- [x] core navigation smoke test passes. `src/app/app.spec.ts` ("renders the deck at the root route") plus the command palette's navigate-on-Enter spec.
- [x] worker smoke test passes. `src/app/app.spec.ts`'s worker-failure-resilience test passes, and `WorkerClientService`'s full message contract is unit-tested. Note: no test currently drives a real browser `Worker` to a *successful* completion end-to-end (jsdom has no real `Worker`) — only failure-resilience and mocked-message-contract paths are covered.
- [x] offline smoke test passes. `e2e/pwa-offline.spec.ts`, fresh run.
- [x] direct-route production test passes. `e2e/production-direct-route.spec.ts`, fresh run, plus confirmed against the live deployed site.
- [x] a simple new tool can be added in ≤30 minutes without shell modifications. Verified via Milestone 10's timed UUID Generator / Inspector exercise: 2m50s, zero shell edits.

---

# 36. Deferred Definition

Anything not checked in the Definition of Done was not required to declare V1 successful.

A roadmap item remaining unbuilt is not a failure.

Stopping after a stable, deployed, extensible foundation was the intended outcome for V1. Further work now follows the §21 roadmap rather than a scope gate.

---

# Appendix A — Interview Questions and Answers

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
| Q11 | Navigation | Hybrid — deck + sidebar + global search/command palette + dedicated routes, no IDE-style persistent tabs. **Amended 2026-09-21:** narrowed, not reversed — multi-tool tabs and resizable workbench panels shipped in Phase 21; the boundary is "a multi-tool workbench, not a source-code IDE." A Monaco-style full IDE remains explicitly out of scope (§5.2). **Current standing boundary:** later editor/LSP/terminal surfaces may exist (Phases 77–80), but DUDE must not become a conventional VS Code clone or editor-first IDE (§5.2). |
| Q12 | Visual style | Minimal developer console, dark-only, super dense. **Amended 2026-09-18:** dark-only stays fixed, but the theme became explicitly bright and colorful rather than muted/monochrome — bold, saturated accent colors used functionally (categories, status, active state) against a dark base. "Minimal ornamentation" applies to shapes/effects, not color intensity. See §8 for the current, authoritative visual spec. **Current status:** the shipped design is still dark-only and authoritative, but Phase 30 may add light/custom themes, density/font preferences, reduced motion, and high-contrast support. |
| Q13 | Dependency strategy | Library-forward — prefer mature libraries where they accelerate reliable delivery. |
| Q14 | Offline/PWA depth | Installable PWA with offline shell and local tools; network-dependent tools explicitly expose connectivity requirements. |
| Q15 | Testing/accessibility quality bar | Ship first — test architecture-critical pieces and obvious regressions, not exhaustive coverage. |
| Q16 | API-backed tool credential policy | User-supplied API keys only; never bundle private keys; session-only by default with explicit opt-in persistence. |
| Q17 | GitHub Pages routing | Clean bookmarkable routes with a `404.html` SPA fallback, not hash routing. |
| Q18 | Browser/device target | Original V1 target: desktop Chromium web/PWA. **Current product hierarchy:** Windows desktop Electron is canonical; desktop Chromium/GitHub Pages is the secondary zero-install companion; cross-platform desktop and broader web parity are future roadmap work. |
| Q19 | Computational isolation | A shared worker execution layer tools can opt into, with cancellation/termination support. |
| Q20 | Executable tools | Deferred for the weekend; sandboxing allowed later. (Later shipped — see §21 Phase 6.) |
| Q21 | Measurable framework success criteria | Extension speed and deployment reliability as hard pass/fail; performance/isolation and architecture clarity as strong targets. |

---

# Appendix B — V1 Scope in One Sentence (Delivered)

> Ship a dark-only but highly colorful, dense, desktop-Chromium Angular PWA on GitHub Pages with a reusable tool registry, clean routes, command/search navigation, per-tool persistence, worker-based failure isolation, offline support, documentation, and exactly enough varied utilities to prove the framework—then stop.

This was the goal for V1 specifically, not a permanent stopping point — the “then stop” reflected the original weekend scope gate. It also preserves the historical fact that V1 was defined around the Chromium/GitHub Pages PWA before the desktop track existed. With V1 and Phases 1–21 delivered, the current product hierarchy is desktop-canonical/web-companion and work continues per the §21 roadmap (see §1.1).

---

# Appendix C — Scope Evolution Record

This appendix records how the original weekend-era exclusions evolved into the durable boundaries in §5.2–§5.3. It is historical context only; all phase references below use the **current roadmap numbering** so the appendix cannot conflict with the authoritative roadmap.

## C.1 Weekend-era exclusions

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

## C.2 Desktop and native-capability decision — 2026-09-20

Native desktop packaging was opened because useful capabilities such as raw networking, arbitrary/background filesystem access, processes, OS integration, local servers, secure OS-backed credentials, and live database/container access cannot be reproduced faithfully by a browser tab.

The decision allowed:

- the shipped Electron application in Phase 8;
- a local bundled backend where a native capability genuinely requires one;
- OS-backed `secure-local` storage;
- native filesystem/process/network/OS integration;
- LAN services and user-operated/self-hosted infrastructure.

The current boundary is stricter and clearer than the early carve-out language: **DUDE Desktop is canonical; DUDE Web is the browser-safe companion; no DUDE-operated hosted cloud is authorized while §5.2 stands.**

## C.3 Collaboration decision — 2026-09-20

Phase 8 Stages 6–7 shipped real-time Markdown collaboration through:

- a same-machine/LAN collaboration server; and
- a user-operated BYO relay for cross-network sessions.

The relay is not a DUDE-operated service. Broader accountless collaboration is tracked in Phase 53. A DUDE-hosted collaboration service remains blocked by §5.2 unless the product owner explicitly changes that boundary.

## C.4 Broader scope reopening — 2026-09-21 onward

The following capabilities moved from blanket exclusion into explicit shipped/current roadmap scope:

- **multi-tool tabs, panels, Saved Sessions, scripted workflow steps, and local history** — shipped in Phase 21;
- **multi-window OS workflows** — Phase 35;
- **self-hosted/BYO snippet sharing** — Phase 32;
- **local secrets vault** — Phase 35, with deeper secrets work in Phase 51;
- **VS Code integration** — Phase 37;
- **browser extension** — Phase 38;
- **light mode/theme customization/accessibility appearance controls** — Phase 30;
- **macOS/Linux desktop support** — Phase 39;
- **mobile companion** — Phase 91;
- **Firefox/Safari parity and broader web compatibility** — Phase 92;
- **local plugin SDK / signed extension ecosystem** — Phases 56–57;
- **public SDK/documentation/component surfaces** — Phases 97–98;
- **localization/i18n and accessibility maturity** — Phase 94.

These roadmap entries do not erase the standing boundaries in §5.2. In particular, editor/LSP/terminal/project work remains subordinate to the developer-workbench identity, and hosted-account/cloud concepts in the distant horizon remain conditional while the no-DUDE-hosted-cloud boundary stands.

## C.5 Testing, accessibility, and performance evolution

The original MVP deliberately rejected exhaustive coverage targets. The modern PRD keeps that pragmatic stance while replacing blanket exclusions with risk-based quality requirements:

- Phase 22 introduces registry/dependency/chunk/cache structural controls;
- Phase 23 introduces vectors, independent cross-checks, property tests, fuzzing, golden corpora, destructive-action tests, sandbox regressions, performance fixtures, and capability-specific release gates;
- Phase 26 shipped registry-wide pipeline parity and filesystem-adapter parity;
- §33 makes shared-core parity and desktop release verification standing build invariants;
- Phase 30 expands appearance/accessibility controls;
- Phase 92 introduces deliberate cross-browser CI at the universal-web horizon;
- Phase 94 introduces mature i18n/accessibility auditing.

The goal is stronger confidence where risk justifies it, not coverage percentages for their own sake.

---

# Appendix D — Commercialization Context

## D.1 Non-authoritative monetization sketch

A free/pro/team-style structure remains only a possible business-model sketch, not a committed roadmap requirement.

A compatible model could keep:

- **free/local:** every ordinary local-first utility and the useful local desktop core, including basic native conveniences such as drag-and-drop, Open With, context-menu actions, and deterministic transformations;
- **advanced individual:** optional advanced workflow/automation, packaging/support, or other value that does not remove formerly-local capabilities;
- **organization/self-hosted:** on-premises management, policy, support, deployment, enterprise integration, self-hosted collaboration/sync/runners, and similar organization-controlled capabilities.

Under the current §5.2 boundary, a DUDE-operated hosted account/sync/collaboration/compute service is **not authorized**. The distant hosted-service ideas retained in Phases 81–95 are conditional alternatives that would require a separate explicit product decision before implementation.

Two constraints are non-negotiable while the current PRD stands:

1. basic developer utilities must never be paywalled merely to force adoption of a paid tier; and
2. no formerly-local capability may be intentionally removed or crippled to manufacture subscription value.

---
