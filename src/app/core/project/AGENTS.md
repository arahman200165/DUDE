# AGENTS.md — src/app/core/project/

Framework layer for Projects (`DUDE_PRD.md` §21 Phase 25 Item 1). Like the rest of `core/`, no file
here ever names a specific tool by id.

## A reference bundle, never a copy

A `Project` (`project.model.ts`) is a named bundle of *references*: a `panelTree`/`openTabs` snapshot
in exactly `WorkspaceTemplate`'s shape (tool ids and split ratios, zero tool content — reuses
`core/workspace/workspace.model.ts`'s `PanelNode`), plus `pinnedPipelineIds` — ids resolved through
`PipelineStoreService`, never a duplicated `Pipeline` object. `ProjectService.recentTools()` is
**derived, not stored**: it filters the live `UnifiedRecentsService.entries()` feed down to the
project's own `openTabs`, exactly the same "never a fifth source of truth" discipline
`core/recents/AGENTS.md` documents for Unified Recents itself. Nothing in this directory ever copies
another store's data into a project — only ids and a layout snapshot.

## Why this stops short of a "project" in the IDE sense

The Workbench Identity Gate (`DUDE_PRD.md` §5.2/§5.3.1 amendment) holds DUDE to "a multi-tool
workbench, not a source-code IDE." A `Project` here is only ever a named preset — layout + pinned
pipeline ids + a derived recent-tools view — the same kind of thing a Workspace Template already is,
plus two more references. There is deliberately no file-tree browsing, no "open folder as project
root," and no per-project working directory. If a future phase wants any of that, it's a new,
separate decision — not an incremental extension of this model.

## Persistence

`'__projects__'` is a synthetic pseudo-tool-id, the same trick `'__workspace__'`/`'__pipelines__'`/
`'__workspace-templates__'` already use — this store gets `PersistenceService.clearAll()`
participation for free. Every persisted field is structural (ids, panel-tree shape, timestamps),
identical in kind to what Workspace Templates and Favorites already persist safely under the same
`local` policy.

## Command Palette source (Phase 25 Item 4)

`project-command-source.ts`'s `ProjectCommandSource` is one `CommandSource` registered via the
multi-provider `COMMAND_SOURCE` token (`shared/models/command-source.model.ts`) -- one "Open
Project: X" command per project, confirming before replacing a non-empty live layout exactly like
`ProjectList.activate()` and Deck's `ResumeWorkPanel`, so all three call sites share one rule.

## `activate()` mirrors `WorkspaceTemplateService.apply()` exactly

`ProjectService.activate()` routes through `WorkspaceLayoutService.applyLayout()` — the one generic
`(panelTree, openTabs) => void` setter — rather than reaching into the layout store's internals
directly, for the same reason `core/workspace/AGENTS.md` documents for templates: exactly one place
ever constructs a raw `WorkspaceLayout`, so a project can never desync from whatever invariants the
layout service enforces elsewhere.
