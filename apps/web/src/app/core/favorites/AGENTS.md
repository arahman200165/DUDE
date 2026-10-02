# AGENTS.md — apps/web/src/app/core/favorites/

Framework layer for Favorites / Pinned Tools and Pinned Pipelines (`DUDE_PRD.md` §21 Phase 24 Items
7/8). Like the rest of `core/`, no file here ever names a specific tool or pipeline by id.

## One store, two id namespaces

A pin is always an explicit user gesture — deliberately not derived from `UsageService`'s automatic
open-count signal, even though both are small `local`-policy stores keyed by id. Declared intent
(“I want this pinned”) and an inferred signal (“this gets opened a lot”) are a real distinction, so
they stay separate stores rather than one field on `UsageStore`. `FavoritesStore` holds `toolIds`
and `pipelineIds` in one blob under the synthetic pseudo-tool-id `'__favorites__'` (the same trick
`'__workspace__'`/`'__pipelines__'`/`'__usage__'` already use) since it's the same toggle gesture
applied to two different id spaces, not two independent features.

## Defensive re-filtering, not defensive deletion

`pinnedTools()`/`pinnedPipelines()` re-resolve every stored id against the live
`ToolRegistryService`/`PipelineStoreService` on every read and silently drop anything that no longer
exists, rather than eagerly deleting the stale id from the store. This mirrors `WorkspaceLayout`'s
own tolerance for a stale reference — a tool/pipeline that comes back (e.g. a pipeline recreated
with the same id is not realistic, but a registry reload during development is) doesn't need its pin
re-added by hand. `isToolPinned`/`isPipelinePinned` still report the raw stored state (so a toggle
call is idempotent even against a currently-unresolvable id) — only the *rendered* pinned lists
filter.
