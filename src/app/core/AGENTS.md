# AGENTS.md — src/app/core/

This directory is the tool-agnostic framework: `registry/` (metadata, search, route generation), `persistence/` (per-tool storage policy), `workers/` (Worker request/result/cancel contract), `connectivity/` (online/offline + update-available signal), and `routing/` (the one root route table). Phase 30I added `home-layout/` (the user-designed Home's grid engine, layout store and panel-manifest helpers; see its own `AGENTS.md` — like everything here it names no panel kind or tool id). Phase 30K added `appearance/` (the pure appearance model and sanitizer, `AppearanceService` — `local`, live across tabs, one `data-*` attribute per axis on `<html>`, the `theme-color` meta, the desktop native-theme sync and the `revision` signal color-reading code re-reads on — the standalone `*.dude-theme.json` file, and the generated `appearance-axes.generated.ts`; the inline pre-paint script in `src/index.html` mirrors its resolution, and `appearance-prepaint.spec.ts` keeps the two in sync). Phase 26 added `offline/` (cache readiness/repair), `share/` (URL input handoff), `backup/` (portable bundles), `pwa/` (install), and `parity/` (registry-wide tests). Keep all of these registry-driven; per-tool exceptions and fixtures live beside the tool, not in core.

## The rule

**No file in this directory should ever know a specific tool by name or ID.** Every tool interacts with `core/` only through `TOOL_DEFINITIONS` (`registry/tool-definitions.ts`) and the generic services here (`PersistenceService.signal(...)`, `WorkerClientService.run(...)`). If adding or modifying a tool seems to require editing something in `core/`, that's an architecture gap, not something to work around — see `/ADDING_A_TOOL.md`'s opening note.

## Changes here are framework-layer, not tool-layer

A change in `core/` affects every tool at once. Treat it with more scrutiny than a tool addition:
- It gets its own git milestone/commit, separate from any tool commit (see `/AGENTS.md`'s git convention).
- Run the full test suite (`npm test` + `npm run test:e2e`), not just the affected tool's spec — `tool-search.spec.ts` and `tool-registry.service.spec.ts` iterate the real `TOOL_DEFINITIONS` array and will catch a lot, but a `core/` behavior change can break tools that never touch the modified file directly (e.g. a `PersistenceService` policy change affects every tool using `session`/`local`).

Reference: `README.md`'s Architecture section and `DUDE_PRD.md` §12.2 (registry responsibilities), §14 (persistence model), §15 (worker layer).
