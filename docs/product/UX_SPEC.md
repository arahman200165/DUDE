# DUDE UX Specification

This specification owns DUDE appearance and interaction. Desktop remains the dense reference surface; React Native needs its own mobile presentation while sharing portable engines and product semantics.

Read [the master PRD](../DUDE_PRD.md) first. Product direction and invariants live there; this document owns the detailed contracts in its domain.

Related: [DUDE Product Specification](PRODUCT_SPEC.md) · [DUDE Security Architecture](../architecture/SECURITY_ARCHITECTURE.md) · [Quality and Release Specification](../delivery/QUALITY_AND_RELEASE.md).

## Contents

- [Mobile Shell](#mobile-shell)
- [Appearance System](#appearance-system)
- [Navigation and Information Architecture](#navigation-and-information-architecture)
- [Shared Tool Shell](#shared-tool-shell)
- [Accessibility](#accessibility)
- [Command Palette Requirements](#command-palette-requirements)
- [Home and Deck Requirements](#home-and-deck-requirements)
- [Tool UX Conventions](#tool-ux-conventions)
- [Loading, Error and Offline States](#loading-error-and-offline-states)
- [Destructive Actions](#destructive-actions)
- [Responsive Behaviour](#responsive-behaviour)

## Mobile Shell

Angular components cannot be reused directly.

Shared TypeScript tool/domain logic can be reused where runtime-compatible.

Create reusable React Native components such as:

```text
ToolScreen
InputEditor
OutputViewer
CopyButton
ToolActions
HistoryDrawer
PipelineRunner
KeyValueEditor
FilePicker
ResultCard
```

## Appearance System

### Theme

**Current shipped state:** dark by default, with controlled first-party theming axes (Phase 30K, Milestones 577–585).

The dark theme is not muted or monochrome: a dark base (background/panel surfaces) paired with a bright, bold, highly saturated accent-color palette used throughout the shell and every tool. Color is a primary structural and functional device, not an afterthought layered on top of a gray UI. The Light theme ("bright workstation") keeps that identity on a light base with its own category palette — hues picked for light surfaces, not darkened copies of the dark ones.

Appearance is a set of independent axes, each with a small set of first-party values that are contrast-checked in every combination ([Color System](#color-system), [Accessibility](#accessibility)):

- **Theme:** Dark (default) / Light / System (follows `prefers-color-scheme`);
- **Contrast:** Standard (default) / High / System (follows `prefers-contrast: more`) — a modifier over both themes;
- **Accent:** Cyan (default), Blue, Violet, Green, Amber, Magenta;
- **Category palette:** Vivid (default), Soft, Color-blind safe;
- **Status colors:** Standard (default) / Color-blind safe (blue/orange; success is blue);
- **Density:** Compact (default), Comfortable, Ultra-compact ([Density](#density));
- **Type:** UI text size and data/code text size (Small / Default / Large each), code ligatures On/Off, and UI and data/code font choices ([Typography](#typography));
- **Motion:** System (default; honors `prefers-reduced-motion`) / Reduce / Allow.

Appearance is global to the installation — stored `local`, live across open tabs — not per workspace or project. Its data scope is `environment` (journaled into the local outbox on desktop, not synchronized before Phase 31D and only after enrollment consent). The only entry points are Settings › Appearance and the Onboarding Appearance page; there are no palette commands or sidebar toggle. An inline pre-paint script in `index.html` sets one `data-*` attribute per axis on `<html>` before the first paint, and `AppearanceService` (`core/appearance/`) owns them after bootstrap. Preferences can be exported and imported as a standalone `*.dude-theme.json` file (preview, then apply) and travel in the optional `appearance` section of the backup bundle.

Customization means composing first-party, pre-validated options per axis. Free color pickers, a user token editor, arbitrary user themes, per-tool themes, and bundled web fonts remain out of scope.

### Density

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

This contract describes the default **Compact** density, which is the Phase 30J baseline (30J.2) and is unchanged by Phase 30K. The opt-in Comfortable and Ultra-compact presets (Phase 30K, M582) scale the same spacing, control-height, row-height, radius and UI-text tokens one step up or down; Compact stays the default.

### Style

Developer console / workstation utility — a colorful, high-contrast terminal/IDE aesthetic, not a muted enterprise dashboard.

Color is used functionally and boldly:

- category color-coding ([Tool categories](../architecture/SYSTEM_ARCHITECTURE.md#tool-categories));
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

The rule of thumb: color should always be carrying information (what category, what state, what severity, what's active) — never decoration for its own sake. That holds in every theme, contrast mode and palette set. Color also never carries that information alone: categories always show an icon and label, status states carry always-on non-color cues (status glyphs, diff +/− markers), and info banners use normal text with a colored ⓘ glyph (Phase 30K, M581).

### Typography

Use monospace selectively for:

- input/output data;
- code-like values;
- timestamps;
- hashes;
- tokens;
- regex;
- structured data.

Navigation and labels may use a compact UI font.

Since Phase 30K (M582), the UI font and the data/code (monospace) font are user choices from curated installed-font stacks, or a sanitized custom installed-font name; UI and data/code text sizes step independently (Small / Default / Large), with the data step applied to monospace subtrees without compounding; code ligatures can be turned off. DUDE bundles no web fonts: a font the system lacks falls back through its stack.

### Color System

The palette is defined once, as data, and shared by the shell and every tool through the design-token/theming layer ([Delivered Repository Architecture](../architecture/SYSTEM_ARCHITECTURE.md#delivered-repository-architecture), `shared/`, and `apps/web/src/styles/`):

- `apps/web/src/styles/theme/theme-tokens.json` is the single machine-readable token source: the base scale per theme and contrast mode, the accents, the category palette sets, the status (semantic) color sets, density steps, text-size steps and font stacks, plus the axis list itself.
- `scripts/generate-theme-css.mjs` generates `apps/web/src/styles/theme.generated.css` — plain `:root` and `:root[data-*]` custom properties (`--dude-*`), with each default expressed through `:not(...)` so an absent or unknown attribute value falls back to the default — and `packages/domain/src/core/appearance/appearance-axes.generated.ts`. Both are generated, never hand-edited; `generate-theme-css.mjs --check` in `npm run lint` fails when they are stale.
- `apps/web/src/styles/tokens.css`'s Tailwind `@theme` block only maps Tailwind names to `var(--dude-*)`, so every utility resolves at use time and follows a runtime appearance change.
- Text on a filled surface uses a paired `on-*` token (today `--color-on-accent`, used as `text-on-accent`), never the page background color; the old `text-bg`-on-fill pattern is retired.

Required elements:

- a base scale (background, panel, elevated panel, border, text, muted text, scrim) for each theme and contrast mode, shared by all tools and shell chrome;
- a bright, bold category palette with enough distinct hues to color-code all [Tool categories](../architecture/SYSTEM_ARCHITECTURE.md#tool-categories) categories without repeats, in every category palette set and theme;
- semantic colors for error, warning, success, info, busy/running and offline states, used consistently by the shared error panel, warning badge, loading indicator, and offline badge ([Shared Tool Shell](#shared-tool-shell)), in a Standard and a Color-blind-safe set;
- a defined active/focus accent used consistently across sidebar selection, command palette selection, and primary buttons, chosen from six first-party accents;
- monospace/data regions ([Typography](#typography)) styled with enough contrast and, where applicable, syntax coloring to stay readable against every base.

Constraints:

- Dark, standard contrast, the Cyan accent, the Vivid category set and Standard status colors are the defaults; every other value is a first-party, pre-validated option ([Theme](#theme)), never a user-defined color;
- every combination of theme × contrast × accent × category set × status set must meet the contrast baseline in [Accessibility](#accessibility) — "bright and bold" must not come at the cost of legibility. `scripts/check-theme-contrast.mjs` (part of `npm run lint`) checks the whole matrix mechanically: 144 combinations and 49,008 checks today;
- new tools reuse the shared tokens rather than inventing tool-specific colors or private palettes, so the shell stays coherent as tools are added. `scripts/check-design-tokens.mjs` rejects raw Tailwind palette utilities, `text-bg`, opacity modifiers on text colors, and hex colors in tool templates and stylesheets (hex values in a tool's `.ts` stay allowed as tool data);
- user documents a tool previews (HTML, SVG, images) keep their own colors, framed by the shared preview-background control (Theme / White / Dark / Checker); the Markdown preview follows the active theme.

**Shipped change to the default dark palette (Phase 30K, M578).** The stricter contrast lint — every category and status color as text on the background, panel and elevated panel, and on its own tinted washes — moved some default dark values that were genuinely illegible: category web `#60a5fa` → `#81b9fe` and security `#e879f9` → `#f97bf7` (the owner chose moving these two categories over making info/busy pastel), and status info `#1a79ff` → `#4294ff`, busy `#c233ff` → `#c966ff`, error `#ff4d4d` → `#ff5757` and offline `#717f94` → `#8c97a8`. Advanced Diff's inline highlights now use normal text color, and 19 faded-text styles were removed.

### Cross-client design continuity

The React Native client shares the controlled first-party token source, category/status semantics and portable preferences, while implementing native layouts, navigation, inputs and accessibility. Angular DOM components, CSS custom properties and Electron window chrome are not directly portable React Native UI.

Preserve the dark-default, colorful, utility-first identity. A phone uses touch-appropriate controls and readable editors instead of copying desktop density. Shared theme choice may synchronize; installed fonts, window geometry, OS accessibility observations and unavailable platform options resolve on the current device. No mobile implementation may bypass the existing contrast, reduced-motion or non-color status requirements for supported equivalents.

## Navigation and Information Architecture

The selected model is a hybrid. Since Phase 30 (verified by the Phase 30L gate) the five navigation surfaces have distinct, non-overlapping jobs:

| Surface | Job | Bounded? |
|---|---|---|
| **Home / Workbench Dashboard** (`/`) | "What do I want to do now?" Action-first, personalized, user-configurable (Phase 30I) | Yes. Its content is independent of registry size |
| **Browse Tools** (`/tools`) | "What does DUDE contain?" The exhaustive registry and discovery surface: search, category/status/platform filters, sort | No. Every registered tool is reachable here |
| **Sidebar** | Persistent destination and category navigation | Yes. A category index with counts; an expanded category shows a capped list plus an "All N" link into Browse Tools |
| **Command Palette** (`Ctrl+K`) | Universal expert launcher across tools, commands, projects, pipelines, recents and preferences ([Command Palette Requirements](#command-palette-requirements)) | Ranked results |
| **Dedicated routes** (`/tools/<route>`) | Stable, bookmarkable tool destinations ([Dedicated tool routes](#dedicated-tool-routes)) | n/a |

### Home / Workbench Dashboard

The Phase 30D default Home is a bounded, action-first workbench surface. It prioritizes Smart Entry, personalized tool launch, resuming projects/workspaces/pipelines, and Quick Run. Local activity summaries and a compact, capped catalog preview may appear, but the complete registry is never Home's dominant content. Phase 30I made the layout user-designed: first-party panels plus user text/link/shortcut panels, arranged in independent wide and narrow layouts from Settings › Home layout. The exhaustive registry belongs to Browse Tools; category navigation, search, and the Command Palette provide the other discovery paths. The Home/panel contract is documented next to the implementation in `apps/web/src/app/shell/deck/AGENTS.md`.

For the original V1 deck, a tool list/grid with all registered tools was required while recent and favorite tools were optional. That remains only as the historical V1 acceptance record. Phase 24 made personalization first-class, and the Phase 30D default Home replaced that V1 layout.

### Browse Tools

The dedicated full-registry browser (Phase 30A) at `/tools` renders registry metadata only, never tool components. Search, category, status and platform filters, and sort are reflected in the URL, so a filtered view is bookmarkable. Sidebar category links and the Home catalog preview deep-link into it (`/tools?category=<id>`).

### Sidebar

The persistent desktop sidebar (Phase 30B) contains:

- DUDE identity;
- global search/command launcher;
- primary shell destinations;
- compact Favorites and Recents entry points;
- registry-derived category links/counts into Browse Tools;
- a Browse Tools entry point;
- active route state.

It stays compact enough to remain open during normal use. Categories are collapsed by default. Explicitly expanding one shows a capped tool list (the active tool always stays visible) followed by an "All N … tools" link into Browse Tools, so the sidebar stays bounded as the registry grows.

### Command palette

Keyboard-accessible global launcher.

Recommended shortcut:

- `Ctrl+K` on the primary target platform.

Capabilities for V1 (historical):

- search by tool title;
- search by keyword;
- search by category;
- navigate directly to tool.

Phase 25 (Milestones 423–424, 441–443) and Milestone 478 extended it into the universal expert launcher. Tools, workspace templates, projects, pipelines (navigate-only), native operations, recent activity, preferences and "Go to" shell destinations all contribute through the declared `COMMAND_SOURCE` contract ([Command Palette Requirements](#command-palette-requirements)). It works from every route, including a user-customized Home.

Still deferred:

- directly executing pipelines from the palette (pending their confirmation gate);
- command history;
- fuzzy action chains;
- extension commands (no plugin loader exists yet).

### Dedicated tool routes

Every tool receives its own bookmarkable route.

Example shape:

```text
/tools/json
/tools/regex
/tools/timestamp
```

The exact route convention may change during implementation, but all tools must have stable dedicated URLs.

### Environment, device and synchronization navigation — planned

Add metadata-driven destinations for Environment/Hub settings, Devices, synchronization status/conflicts and Backup/Restore without changing the bounded Home/catalog relationship. Display the selected environment and current device where their identity affects an operation.

Settings controls show their scope before editing. Sync status distinguishes local-only, connected/up-to-date, offline with pending changes, syncing, conflict, rejected/revoked, and incompatible version. A user can inspect pending operations, retry eligible failures, resolve conflicts and deliberately discard a pending edit without accidentally issuing a canonical deletion.

The command palette may navigate to these surfaces. Device registration or listing an online device does not create a “run remotely” permission. Future Run-on-Device controls remain unavailable until the remote-execution phase and action-level authorization are delivered.

## Shared Tool Shell

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

## Accessibility

Accessibility is important but not the primary optimization target.

Minimum expectations:

- interactive controls are keyboard reachable;
- focus is visible;
- buttons use semantic elements;
- form controls have names/labels;
- command palette can be dismissed by keyboard;
- navigation state is understandable;
- obvious contrast failures are avoided — the bright/bold accent colors used throughout the UI ([Color System](#color-system)) must meet the contrast bar below against every shipped base, not just look vivid;
- color is never the only carrier of meaning: categories show an icon and label, status states carry always-on non-color cues (status glyphs, diff +/− markers).

Appearance accessibility baseline (Phase 30K):

- **High contrast** (Standard / High / System, following `prefers-contrast: more`) is a modifier over both themes: text reaches ≥ 7:1, borders become real ≥ 3:1 boundaries, the focus ring is thicker, and accent washes are clamped so accent text keeps ≥ 7:1.
- **Forced colors** (Windows Contrast Themes): focus, selection, disabled state and chips are re-expressed with system colors and outlines; canvas charts fall back to their recolored panel border and HTML labels.
- **Reduced motion** (System by default, honoring `prefers-reduced-motion`, or Reduce / Allow): under Reduce, app animation and transitions are removed globally, and skeleton pulses become static. Previews of user-authored motion (CSS Animation Builder, Cubic-Bezier Editor) are exempt but start paused with a Play control.
- **Color-blind-safe options**: a Color-blind-safe category palette and a blue/orange status set, both checked for distinguishability under simulated protanopia, deuteranopia and tritanopia.

Formal accessibility certification is out of scope.

## Command Palette Requirements

The command palette is the universal expert launcher ([Navigation and Information Architecture](#navigation-and-information-architecture)). Since Phase 25 it covers more than navigation; see the shipped expansion below.

### Required

- open by keyboard;
- search tools;
- arrow-key selection;
- Enter to navigate;
- Escape to close;
- auto-focus search input.

### Historical V1 Deferred Items / Later Roadmap

The V1 palette was navigation-only. The following were deliberately deferred then:

- tool actions;
- configurable shortcuts;
- nested commands;
- command aliases managed by users;
- macros.

**✅ Shipped in Phase 25** (Milestones 423–424, 441–443): the proposed palette expansion, via a declared `CommandSource`/`COMMAND_SOURCE` multi-provider contract rather than hard-coded shell branches — tools, workspace templates, projects, pipelines (navigate-only), native operations, recent activity, and preferences all share one launcher today. Extension commands remain out of scope until a plugin loader exists; later plugin/IDE/automation phases can add commands through that same declared `CommandSource` API rather than a new mechanism.

## Home and Deck Requirements

The Phase 30D Home workbench is useful, dense, and bounded in its default layout. Phase 30L verified this against the shipped navigation ([Navigation and Information Architecture](#navigation-and-information-architecture)).

Required:

- immediate Smart Entry/paste/drop;
- personalized launch and resume surfaces using existing authoritative stores;
- compact Quick Run access;
- a clear route to Browse Tools;
- keyboard-compatible actions and links;
- a configurable Home layout (Phase 30I);
- content bounded independently of registry size. Verified with a synthetic 500- and 1,000-tool registry (Phase 30L.6);
- no eager loading of tool implementation chunks (Phase 30L.1).

Under Phase 30A/30D, the complete registered tool inventory belongs to Browse Tools, not to Home's default content. Home may show bounded category/tool previews and user-selected discovery panels. Direct tool routes remain stable.

For the original V1 Deck, all registered tools were required on the Deck and recently used/favorite tools were optional unless trivial. That remains only as a historical acceptance record. Phase 24 made personalization first-class, and Phase 30D replaced the V1 Deck composition.

## Tool UX Conventions

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

## Loading, Error and Offline States

Keep processing state, cancellation and input-local errors visible without blocking shell navigation. An uncached runtime, Hub outage, expired authentication, denied permission and unsupported native capability need distinguishable, actionable states. Preserve queued edits and recoverable data. Detailed behavior lives in [Offline Support and Reconnection](PRODUCT_SPEC.md#offline-support-matrix-and-reconnection-rules) and [Error and Failure Isolation](../architecture/SYSTEM_ARCHITECTURE.md#error-and-failure-isolation).

## Destructive Actions

Show a distinct preview followed by a separate deliberate confirmation; import/open/detection is never confirmation. The technical contract, consequence tagging and confirmation-boundary tests are authoritative in [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract).

## Responsive Behaviour

Windows desktop and desktop Chromium remain the shipped reference platforms. Android requires mobile-native interaction under its planned release gate; narrow-screen browser parity, touch-first universal web and iOS are later roadmap scope. Follow [Product Surfaces](PRODUCT_SPEC.md#product-surfaces) and [Cross-client Design Continuity](#cross-client-design-continuity). Automated appearance/contrast acceptance lives in [Accessibility Gates](../delivery/QUALITY_AND_RELEASE.md#accessibility-gates).
