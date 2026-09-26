# AGENTS.md — src/app/shell/history/

The `/history` route (DUDE_PRD.md §21 Phase 21 Item 5) — the fourth sanctioned exception to
`shell/AGENTS.md`'s "nothing here hard-codes a tool ID" rule, after `pipelines/`, `smart-paste/`,
and `workspace/`. A cross-tool history feed is discovery/recall infrastructure spanning every tool,
not a 278th tool. No category, no `TOOL_DEFINITIONS` entry, no `buildToolRoutes()` entry — every
tool id referenced (a feed row, a filter option) is data resolved via `ToolRegistryService`, never a
hard-coded branch.

See `core/history/AGENTS.md` for the eligibility rule, exclusion categories, and the shared
`<id>.workspace-step.ts` adapter this page's data comes from.

`ToolShell`'s "History" link (`shared/components/tool-shell/`) deep-links here via
`/history?tool=<id>`, read once in `HistoryPage`'s constructor to seed the tool filter — the one
per-tool-aware entry point, resolved generically, same as the "View history" button being available
on all 277 tools for free rather than requiring a per-tool retrofit.

## Unified Recents (Phase 24 Item 13) extends this exception, not a new one

`recents-tab/` and `HistoryPage`'s "History"/"Recents" tab toggle live inside this same sanctioned
exception — Unified Recents is cross-tool activity infrastructure exactly like History itself, just
a different derived view (`core/recents/UnifiedRecentsService`) over four already-existing stores,
never a fifth recording mechanism. See `core/recents/AGENTS.md`.
