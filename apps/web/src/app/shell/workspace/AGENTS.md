# AGENTS.md — apps/web/src/app/shell/workspace/

The `/workspace` route (DUDE_PRD.md §21 Phase 21 Item 4) — the third sanctioned exception to
`shell/AGENTS.md`'s "nothing here hard-codes a tool ID" rule, after `pipelines/` and `smart-paste/`.
Justified the same way: a multi-tool tab strip and resizable panel layout change what "the shell's
content area" means, rather than adding a 278th tool. No category, no `TOOL_DEFINITIONS` entry, no
`buildToolRoutes()` entry — every tool id referenced (a tab, a panel leaf, a "split right" target)
is data resolved via `ToolRegistryService`, never a hard-coded branch.

## Why not named router outlets

The shell has exactly one `<router-outlet>` (`shell/layout/shell-layout.ts`). Panel/tab count is
open-ended, so named/auxiliary router outlets were considered and rejected: supporting them would
mean either a multiplicative blow-up of `buildToolRoutes()` per outlet slot, or an ever-growing
`;outlets:{...}` URL segment nothing else in DUDE does. Instead, `ToolHost`
(`shell/workspace/tool-host/`) mounts a tool by id via `NgComponentOutlet`, reusing the tool's own
existing lazy `ToolDefinition.load()` — the same one `buildToolRoutes()` already uses for normal
routing — and provides `WORKSPACE_HOST_CONTEXT` (`core/workspace/workspace-host-context.ts`) so the
mounted tool's `ToolShell` can resolve which tool it is without a route. See
`core/workspace/AGENTS.md` for the full rationale and the governing privacy rule.

## The panel tree

`WorkspaceLayoutService` (`core/workspace/`) owns an ordered `openTabs` list (drives the tab strip)
and a recursive `PanelNode` tree (`leaf` | `split`, `core/workspace/workspace.model.ts`) rendered by
`PanelHost`, which nests the existing `SplitPane` (`shared/components/split-pane/`) unmodified —
horizontal splits only, matching all of `SplitPane`'s other 27+ call sites. A vertical split would
need `SplitPane` itself extended with a direction input; out of scope for this build.

**v1 limit, documented deliberately, not a bug:** one open tab per tool id.
`PersistenceService` namespaces storage strictly by `toolId` (`dude:v1:<toolId>:<key>`), so two
simultaneous instances of the same tool would clobber each other's storage. `openTool(existingId)`
focuses the existing tab instead of duplicating it.

## What's not wired up yet

`ToolHost` mounts/unmounts tools but does not yet capture or restore their live state across a tab
switch — Milestone 293's `WorkspaceStateService` adds that (in-memory tier for `none`/`session`-
policy tools, IndexedDB for `local`/consented-`user-choice` tools, per the governing privacy rule).
Until then, switching which tool a leaf shows simply (re)mounts a fresh instance, exactly like
navigating to a fresh route today.
