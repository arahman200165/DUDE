# AGENTS.md — src/app/core/recents/

Framework layer for Unified Recents (`DUDE_PRD.md` §21 Phase 24 Item 13). Like the rest of `core/`,
no file here ever names a specific tool by id.

## A derived view, never a redundant source of truth

`UnifiedRecentsService` reads `UsageService`, `PipelineStoreService`, `WorkspaceLayoutService`,
`HistoryService`, and (Phase 25 Item 5) `NativeRecentsService`, and merges them — it never records
anything itself. This is deliberate: it's what lets "opened JWT Debugger" (from `UsageService`'s
uniform, content-free, all-277-tools log) sit alongside a real content entry only for tools that
separately opted into History (`historyEligible: true`), without conflating the two very different
eligibility rules those two services already enforce. If a new activity source is ever added, extend
`mergeUnifiedRecents`'s inputs here — never add a second recording call site. `NativeRecentsService`
was a legitimate fifth input, not a violation of this rule, because a native-file open was genuinely
new activity nothing else recorded — see `core/native-recents/AGENTS.md`.

## Why "workspace-tab" entries use the current time, not a real timestamp

`WorkspaceLayoutService.openTabs()` (`core/workspace/workspace.model.ts`) carries no per-tab
timestamp — it's "every tool id ever opened this session, in open order," not a time-stamped log.
Rather than fabricating a historical timestamp or bolting a new field onto the layout store (which
would touch the "layout preference" governing rule in `core/workspace/AGENTS.md` for no real
benefit), a workspace-tab entry's `at` is simply "now," recomputed on every reactive read. This is an
honest "this tool is open right now" signal, not a claim about *when* it was opened — that fact, if
it matters, is already available as a separate `'tool'`-kind entry from `UsageService`.

## Pure merge logic lives separately from the Angular service

`unified-recents.ts`'s `mergeUnifiedRecents` (dedupe-by-`(kind,id)`-keep-latest, sort, cap at 50) is
plain and framework-free specifically so it's testable with synthetic entries, mirroring every other
pure-logic-behind-a-thin-service split in this codebase (`paste-detect.ts`, `pipeline-suggestions.ts`,
etc.). `UnifiedRecentsService` itself only ever gathers the four live sources and calls it.
