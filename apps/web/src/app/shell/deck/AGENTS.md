# AGENTS.md — apps/web/src/app/shell/deck/ (Home / Workbench shell contract)

Home (`/`, the `Deck` component) and how it relates to the rest of the shell. Sanctioned by `DUDE_PRD.md` §21 Phases 30A–30L; this file is the "shared design documentation" of 30L.8. Framework internals (store, grid engine, safety rules) live in `core/home-layout/AGENTS.md`; usage privacy in `core/usage/AGENTS.md`; the add-a-panel recipe in `/ADDING_A_TOOL.md` ("Adding a Home panel (not a tool)"). Appearance/token rules: `shared/AGENTS.md`.

## Who answers what

> **Home answers "what do I want to do now?" Browse Tools answers "what does DUDE contain?"** The complete registry is never Home's dominant content.

| Surface | Role | Rules |
|---|---|---|
| **Home** (`deck/`) | Bounded, personalized, action-first, user-configurable dashboard | Renders only what the layout store + panel registry describe. Never lists every tool; bounded samples only (`PREVIEW_LIMIT = 6` in `category-preview-section.ts`). |
| **Browse Tools** (`browse-tools/`, `/tools`) | Exhaustive, searchable/filterable/sortable catalog | URL query is the source of truth for search/filters/sort/view; only view mode and sort mode persist (`'__browse_tools__'` namespace, keys `viewMode`, `sortMode`). Filtering is pure `core/registry/browse-tools-*.ts`. |
| **Sidebar** (`sidebar/`) | Persistent destination + bounded category index | Category rows show live `computeCatalogCounts()` counts and link into Browse; an expanded category is capped (`SIDEBAR_CATEGORY_LIMIT`, plus the active tool) with an "All N … tools →" link into Browse. Kept-open categories persist under `'__sidebar__'`; the active route's category still auto-expands. Compact Favorites/Recents are read-only views (`RECENTS_LIMIT = 5`). |
| **Command Palette** (`Ctrl+K`) | Universal expert launcher | Fed by `COMMAND_SOURCE` providers + `SHELL_DESTINATIONS` (`navigation-command-source.ts`); reaches every tool regardless of Home layout. |
| **Dedicated routes** | Stable, bookmarkable destinations (`/tools/<id>`, `/insights`, `/quick-run`, …) | Home panels link to these; they never replace them. |

Home must never eagerly load tool implementation chunks: panels read registry *metadata* (`ToolRegistryService`), never `ToolDefinition.load()`. `quick-run-panel.ts` resolves its candidate tools (`loadPipelineStep`, up to `CANDIDATE_LIMIT = 8` favorite/most-used) only on first user intent (focus/input/paste/run), never on mount or hover.

**Adding, removing or reordering a tool must never require editing Home.** Registering a tool creates no panel; a panel is its own explicit manifest.

## Default Home and the layout editor

- `Deck` (`deck.ts`) is only page chrome ("Dashboard" heading, **Edit Home** link to `/settings/home-layout`) around `HomeCanvas`; it also runs the one-time `migrateLegacyHomePanel` (old Notes & links → text/link panels).
- The shipped default is **assembled from manifests** (`core/home-layout/default-layout.ts`, `buildDefaultLayout`): every kind with `defaultPlacement` becomes one visible instance (instance id = kind id), packed in `order`, first-fit, never starting above the previous row. Current order: home-search 1, smart-entry 2, home-pwa-hint 3, home-open-file 4, recent-tools 5, favorites 6, resume-work 7, quick-run 8, insights-summary 9, activity-trend 10, category-usage 11, top-tools 12, recent-activity 13, user-text 14, user-links 15, clipboard-actions 16, native-capabilities 17, category-strip 18, category-preview 19. `user-shortcuts` has no `defaultPlacement` (picker only). Reorder by editing `order` in the manifest, never Home code.
- Untouched installs store no layout and render this default, so newly shipped kinds appear for them; after a Save, new kinds appear only in Settings › Home layout's picker.
- **Settings › Home layout** (`settings/sections/home-layout-settings.*`) is a keyboard-first list/form editor over a *draft* (`draft-ops.ts`, pure): add from the registry picker, show/hide, move earlier/later, x/y/w/h by number, duplicate (multi-instance kinds only), per-panel config and content, remove, separate **Wide / Narrow** tabs, Save / Discard (dirty state registered with `SettingsUnsavedChanges` under key `'home-layout'`), two-step Reset to Default. The optional **Drag & resize…** surface (`home-layout-visual/`) is `gridstack` (exact-pinned), behind the `@defer` and a dynamic `import('gridstack')` in `gridstack-adapter.ts` — never in the Home bundle. It only *proposes*; every proposal goes through `placePanel` → `tryPlace`, and a refusal snaps back with the reason in the live status.

## Panel-kind contract (built-in)

A kind is a colocated `<kind-id>.panel-manifest.ts` exporting `panel: PanelDefinition` (`shared/models/panel-definition.model.ts`). The `.panel-manifest.ts` suffix is distinct from `.manifest.ts` so a panel is never mistaken for a tool. `node scripts/generate-panel-registry.mjs` (part of `npm run generate:registry`) scans `apps/web/src/app/**` for the suffix, requires a kebab-case file-name id, rejects duplicates, and writes `core/registry/panel-definitions.ts` (generated, never hand-edited). `PanelRegistryService` is the single index used by the renderer, editor, picker, default layout and validation; `validatePanelDefinitions` (`panel-validation.ts`) is asserted over the real registry by `home-layout-framework.spec.ts`, which also fails if a registered kind id appears in `core/home-layout/` sources.

Fields (all in `PanelDefinition`): `id`, `title`, `description`, `load` (lazy renderer), `size` (`minW/minH`, optional `maxW/maxH`, whole cells of the 12-column grid), `defaultPlacement?` (`order/w/h`), `multiInstance?` (requires `config` or `userContent` so copies are distinct), `config?` (typed `number | select | boolean` fields, validated on restore/import), `capabilities?` / `desktopOnly?` / `webBehavior?` (`'omit'` default | `'explain'`, and `explain` requires a web-blocked capability), `showWhen?`, `deferUntilVisible?`, `dataDependencies` (closed `PANEL_DATA_SOURCES`: `tool-registry, usage, favorites, recents, pipelines, workspaces, projects, command-sources, smart-paste, platform, user-content`), `userContent?`, `replaces?`.

**Ownership:**
- *Data* — the panel component injects its authoritative service directly (favorites → `FavoritesService`, opens → `UsageService`, …). `dataDependencies` documents that; it is not a copy or a loader. Instance id/config arrive via `inject(PANEL_CONTEXT, { optional: true })` (`panelNumber` / `panelString` helpers).
- *Platform availability* — the manifest declares it (`desktopOnly`/`capabilities` + `webBehavior`); `panelAvailability()` (`core/home-layout/panel-availability.ts`) resolves it, `PanelHost` renders the compact "Desktop only" `app-disclosure` for `explain`. Every built-in desktop-only kind currently uses `'omit'`. Data-level platform gating (e.g. projects/workspaces only on desktop) stays inside the panel (`resume-work-home-panel.ts`).
- *Data-driven applicability* — `showWhen` (run in an injection context, signals tracked, must be cheap) omits an empty panel and `compactUp` closes the gap; the editor still lists it. Used by favorites, recent-tools, home-pwa-hint, clipboard-actions, native-capabilities.
- *Rendering* — `HomeCanvas` names no kind: it measures its own container (`NARROW_MAX_PX = 720` in `home-cells.ts`), `resolveCells` drops hidden/dormant/omitted/not-applicable cells, compacts upward and returns reading order (= DOM/focus order); `PanelSlot` lazy-loads via `withLoadFallback`; `deferUntilVisible` wraps in `@defer (on viewport)`.
- **Mounting never does anything consequential.** Actions happen on a click through the target's own confirmation path.

**User-authored kinds** (`user-text`, `user-links`, `user-shortcuts`; `userContent: 'text' | 'link' | 'shortcut'`, all rendered by `user-panels/user-content-panel`): content lives in the layout store keyed by instance id, never in manifests. Plain text only (never markup); links http(s), no credentials (`normalizeExternalUrl`), opened only by click (`ExternalLinkService` on desktop); shortcuts store *ids* (`SHORTCUT_TARGET_KINDS`: tool, destination, settings, command) resolved by `ShortcutResolverService`, a missing target becomes a disabled chip and `run` fires only from a click. Caps: `MAX_USER_TITLE_CHARS` 60, `MAX_TEXT_CHARS` 2000, `MAX_PANEL_LINKS` 10, `MAX_SHORTCUTS` 12 (`user-content.model.ts`).

## Layout persistence, versioning, recovery

- Store: `'__home-layout__'` / key `layout`, `local`, `crossTab: 'live'`; `HOME_LAYOUT_SCHEMA_VERSION = 1`, `MAX_INSTANCES = 60`. Shape (`HomeLayoutData`): `customized`, `narrowCustomized`, `instances` (`{id, kindId, config, visible}`), `wide[]` and `narrow[]` placements (`{id,x,y,w,h}`), `content`. Instances and content are shared; only placements differ per width. Backup: optional `homeLayout` bundle section, re-sanitized on parse and apply (skip / replace / keep-both).
- **Narrow follows wide** (`deriveNarrow`) until the user deliberately edits the Narrow tab (`narrowCustomized`); "Follow the wide layout again" re-derives it.
- **Recovery, not blanking** (`sanitizeHomeLayoutData`): unknown kinds stay as *dormant* instances (skipped when rendering; the editor shows "Unavailable panel (<kind>)" and lets the user remove them); a renamed kind is adopted through `replaces` (`PanelRegistryService.resolveKind`); single-instance duplicates, bad ids, bad config and bad/missing placements are repaired (unplaced instances are appended at the bottom); corrupt data degrades to "not customized" (the manifest default). A stored `schemaVersion` newer than ours is read best-effort (v1 fields) and never overwritten on load. Save is atomic and rejects overlaps/out-of-range (`validateLayout`), never silently moving panels.
- **Reset to Default** (two-step confirm) is layout-only: it clears instances/placements and keeps only content for panels that exist in the default; favorites, usage, projects, workspaces, pipelines are never touched. Clear All covers the namespace.
- Renaming a kind requires `replaces: ['old-id']`; removing one needs nothing (dormant fallback).

## Dashboard panel conventions

- Use `app-dashboard-panel` (`shared/components/dashboard-panel/`): compact header, optional category icon/count, "View all →", `loading`, `empty` + `[panelEmpty]` slot, `[panelActions]` slot. No oversized padding, heavy shadows, gradients or private card CSS; don't force cards on tool workspaces.
- **Empty states are honest and actionable**: say what is missing and how it starts (e.g. "No opens tracked yet — open a tool and daily tracking starts today."); Resume Work's empty state offers Browse tools. Never fabricate placeholder data.
- **Progressive disclosure** (`app-disclosure`) for secondary explanation; primary actions stay visible.
- **Density targets** (30J.2, Compact default; Comfortable/Ultra-compact scale the same tokens): text 12–13px, metadata 11–12px, controls 28–32px, rows 28–32px, panel padding 8–12px, grid gap 8px (`gap-2` in `home-canvas.html`), radius 3–5px; spacing scale 4/8/12/16/24. Use Tailwind scale + `dude-*` utilities, no arbitrary sizes (`check:design`).
- **First-viewport targets** (default layout, 30D.2): at 1920×1080 Smart Entry, Favorites/Recents, one Resume Work surface (or its start-work empty state) and Quick Run are visible without scrolling; at 1440×900 the same minus Quick Run; at 1366×768 the first action is immediate; no horizontal page scroll. Charts, tables and the catalog preview may sit below the fold (hence `deferUntilVisible`). User layouts need not keep the order but must not overflow or strand controls.
- **Category color** is structural: resting surfaces are neutral `bg-panel` with a 2px category rule (`border-t-2`/`border-l-2 border-*-<token>`) and the wash is **hover-only** (`hover:bg-cat-*-wash`); icon/label/count/badge/chart series carry identity. Colors come from tokens only (no hex, no raw palette, no opacity on text); semantic status colors stay distinct from category colors; never color alone (`app-status-glyph`).

## Charts and tables

- Charts are `shared/components/workbench-charts/` (`app-sparkline-chart`, `app-bar-chart`, `app-ranked-bars-chart`; lazy ECharts core in `echarts-loader.ts`). They **consume already-derived aggregates** (`InsightsDataService`, `core/usage/activity-summary.ts`, `rankCategoryUsage`) — panels never recompute usage from raw logs or hand-map categories; category names/colors come from `CATEGORY_METADATA`. Ranking uses horizontal bars, not pie/donut.
- Each chart reads token colors (`readColorToken`, `RankedBarInput.colorToken`) and **re-reads them when `AppearanceService.revision()` changes**; has a text equivalent (visible values / sr-only list / focusable cells); no gradients, glow or decorative animation. Tool code must not depend on the chart package.
- Incomplete data is labelled, never zero-filled: days before `trackingStartedOn` are "not tracked", partial periods say so, lifetime counts are labelled lifetime.
- Tables use `app-data-table` (`shared/components/data-table/`): sticky compact header, `aria-sort` sorting, arrow-key/Enter row navigation, truncation with full-value disclosure, virtualization above `virtualizeThreshold` (100). Don't build a second table. Home shows bounded slices; `/insights` and `/history` are the full destinations.

## State-source ownership and privacy

- Home composes; it never owns: tool metadata → `ToolRegistryService`; opens → `UsageService` (the only recorder); pins → `FavoritesService`; activity → `UnifiedRecentsService.activityEntries` (not `entries`, whose workspace-tab entries have a synthetic "now"); pipelines → `PipelineStoreService`; workspaces/projects → their services; palette content → `COMMAND_SOURCE`; classification → Smart Paste detectors. The layout store holds ids and presentation only.
- **Local-only**: no network call, telemetry, identity or content hashes for metrics. Usage holds tool ids, integer counts and local dates only (`MAX_DAILY_BUCKETS = 30`); never inputs, outputs, filenames or secrets, and it is excluded from backups. Privacy audit: `phase24-privacy-audit.spec.ts`. Avoid vanity metrics (scores, streaks, time-saved).
- User-typed panel content is the one exception: plain text stored on this device, included in Clear All and backups, never sent anywhere. The editor says so. Don't feed it to usage code.

## Keyboard and list/form conventions

The editor must be fully operable without drag: ordered list ("Panels in reading order") with labelled per-row buttons (`Move <title> earlier/later`, `Duplicate`, `Edit` with `aria-expanded`, `Remove`), numeric position/size fields that snap back on refusal, Wide/Narrow `role="tablist"`, an `aria-live` result line plus `role="alert"` issue list, and a schematic preview with a text alternative. Visual editor: arrow keys move, Shift+arrow resizes, resize handles always visible (not hover-only). Focus order = reading order of the active width. Home tables/rails keep Enter-to-open reachable.

## Making a future feature Home-eligible

1. Add `<kind-id>.panel-manifest.ts` beside the feature's component (any directory under `apps/web/src/app/`) — see `/ADDING_A_TOOL.md` "Adding a Home panel"; do not duplicate the recipe here.
2. Read live from the owning service; declare `dataDependencies`, platform behavior, `showWhen` for empty states, `deferUntilVisible` if heavy. Add a new `PANEL_DATA_SOURCES` entry only if the source is genuinely new and authoritative.
3. Run `npm run generate:registry`, `npm test`, `npm run lint`. No edit to `shell/`, `core/`, `HomeCanvas`, `home-layout-settings` or `app.routes.ts` should be needed; if one is, fix the framework instead.
4. Never hard-code a tool or panel id in an unrelated shell component (Home renderer, editor, sidebar, palette). Shortcut panels reference ids as user data, resolved generically.
