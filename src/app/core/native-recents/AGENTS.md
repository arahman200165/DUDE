# AGENTS.md — src/app/core/native-recents/

Framework layer for the Native File Recent List (`DUDE_PRD.md` §21 Phase 25 Item 5). Like the rest
of `core/`, no file here ever names a specific tool by id.

## Scope: one call site, structural metadata only

`NativeRecentsService.record()` is called from exactly one place --
`DesktopOpenService`'s existing successful-file-open branch (`core/platform/desktop-open.service.ts`,
inside `flush()`) -- never from a tool's own file input. Only `{path, name, extension, openedAt}` is
ever stored; content is never read into this store, matching the same governing privacy rule
`core/workspace/AGENTS.md` documents for Workspace/History (a tool's content never outlives the
`PersistencePolicy` its own code declares, and this feature never touches tool content at all).

## A legitimate fifth Unified Recents input, not a violation of "never a fifth source of truth"

`core/recents/AGENTS.md`'s rule guards against `UnifiedRecentsService` *re-deriving* activity another
service already records. A native-file open is genuinely new activity with no existing recorder, so
adding it as a `'native-file'`-kind `UnifiedRecentEntry` (Milestone 445) is a legitimate fifth input,
exactly like the original four weren't meant to be an exhaustive, closed list.

## Reopening never caches content

`NativeRecentEntry` never carries file text. Reopening a native recent (Milestone 445's
`dude:open:reopen` IPC) re-resolves the file from disk through `enqueueOpenPath`'s existing
size/extension checks -- the same bounded path every fresh Explorer-association open already takes --
rather than replaying a cached snapshot.

## `enabled` gates recording only, never purges retroactively

The opt-out toggle (Milestone 446) is a separate signal under its own key
(`'__native-recents__'`/`'enabled'`), mirroring `WorkspaceLayoutService.reopenOnRestart`'s shape. Like
that toggle, flipping it off only stops *future* recordings -- it never retroactively deletes
already-stored entries; clearing those requires the explicit clear-all/remove-one actions.
