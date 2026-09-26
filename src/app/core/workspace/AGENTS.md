# AGENTS.md — src/app/core/workspace/

Framework layer for the Persistent Workspace/Scratchpad (`DUDE_PRD.md` §21 Phase 21 Item 4) and the shared
foundation Persistent Local History (Item 5) builds on. Like the rest of `core/`, no file here ever names a
specific tool by id.

## The `<id>.workspace-step.ts` convention

A workspace/history-eligible tool exposes itself by placing a file at
`src/app/tools/<id>/<id>.workspace-step.ts` that exports `workspaceStep: WorkspaceStep`
(`src/app/shared/models/workspace-step.model.ts`). `workspace-step-loader.ts`'s `loadWorkspaceStep(id)`
finds it purely by string convention — a template-literal dynamic import built from `id` — never via a
hand-maintained field on `ToolDefinition` or a parallel `id -> step` map. This mirrors
`core/pipeline/pipeline-step-loader.ts`'s `loadPipelineStep` exactly, on purpose: same reasoning (a folder
rename can't leave a stale registry entry behind), same cost (one extra file per participating tool).

A tool with no such file simply isn't eligible for live tab/panel state mirroring or Local History
recording — `loadWorkspaceStep` returns `undefined` and callers treat that as "not available," never an
error, exactly like the pipeline-step precedent.

**One adapter file, shared by two features.** Unlike Pipelines and History, Workspace mirroring and Local
History do not each get their own convention file — `WorkspaceStep` carries both a `snapshot()`/`restore()`
pair (Workspace's concern) and an opt-in `historyEligible`/`historySummary` (History's concern) in one
place. `core/history/` imports `loadWorkspaceStep` from here rather than defining a second loader — one
dynamic-import site per tool, not two. See `core/history/AGENTS.md` for why `historyEligible` defaults to
ineligible rather than being inferred from the tool's own `PersistencePolicy`.

## Writing a `.workspace-step.ts` adapter

It is a **thin wrapper**, never a rewrite of the tool's existing persistence calls. Use
`workspace-storage-bridge.ts`'s `readStorageValue`/`writeStorageValue` to read/write the *same*
`dude:v1:<toolId>:<key>` storage keys the tool's own `PersistenceService.signal(toolId, key, policy, ...)`
calls already use — `snapshot()` reads them, `restore()` writes them back before the tool component
(re)mounts, so the component's own constructor picks up the restored value on its normal synchronous
storage read. See `src/app/tools/base64/base64.workspace-step.ts` once it lands (Milestone 290) for the
worked example.

`'none'`-policy tools (nothing ever touches storage, e.g. JWT Debugger) can't use the storage bridge at
all — their `restore()` instead goes through `workspace-handoff.ts` (Milestone 290), a plain
module-scoped hand-off (deliberately not an `@Injectable`, since `restore()` runs outside any Angular
injection context) mirroring `core/paste-detect/paste-handoff.service.ts`'s one-shot in-memory shape.

## Why there is no separate durable content tier

The original design pass (see `DUDE_PRD.md`'s Phase 21 Item 4/5 amendment) anticipated a Milestone
293 IndexedDB "durable content tier" for Saved Sessions, mirroring what History (`core/history/`)
needs. Building it revealed it's unnecessary: a real browser relaunch clears every in-memory JS
value (any snapshot cache would be wiped too) but leaves `localStorage` untouched. Since `ToolHost`
remounts a tool by calling its own `ToolDefinition.load()` after Milestone 291's `'__workspace__'`/
`layout` store (itself `local`-policy) restores which tools were open, the remounted tool's
constructor runs its own already-existing `persistence.signal(toolId, key, policy, initialValue)`
calls exactly as on any fresh navigation — a `local`-policy field reads its still-present
`localStorage` value back automatically, a `session`-policy field reads a genuinely fresh (empty)
`sessionStorage`, and a `'none'`-policy field starts empty because it was never in any storage to
begin with. No capture, no restore call, no IndexedDB write is needed for any of these three cases
— see `workspace-relaunch.spec.ts` for the test that proves it. The `<id>.workspace-step.ts`
`snapshot()`/`restore()` pair therefore exists purely for **live tab-switching within one session**
(the in-memory-only case for `'none'`-policy tools, via `workspace-handoff.ts`) and for **History**
(`core/history/`, which genuinely needs its own IndexedDB store, since a History entry is a growing
log of past snapshots, not a single current value) — not for Saved Sessions' relaunch case, which
Milestone 291's layout store already covers completely.

## Workspace Templates (Phase 24 Item 11)

A template (`workspace-template.model.ts`) is exactly `WorkspaceLayout` minus `focusedNodeId` — tool
ids and panel-tree shape, zero tool content, same as the layout store itself. `BUILT_IN_TEMPLATES`
is curated data ("API Debugging," "JWT/Auth," "Data Cleanup," "Certificate Inspection"), mirroring
`core/paste-detect/paste-detectors.ts`'s "data, not control flow" shape — its own model spec asserts
every referenced tool id still resolves in the real registry, so a future tool rename/removal fails
loudly here instead of silently producing a template with a dead leaf. User-defined templates
persist under `'__workspace-templates__'`, the same synthetic-pseudo-tool-id pattern as
`'__workspace__'`/`'__pipelines__'`.

`WorkspaceTemplateService.apply()` always routes through `WorkspaceLayoutService.applyLayout()` — a
thin, generic `(panelTree, openTabs) => void` setter that carries no template-specific knowledge —
rather than a template service reaching into the layout store's internals directly. This keeps
exactly one place that ever constructs a raw `WorkspaceLayout` object, so a template can never
desync from whatever invariants the layout service enforces elsewhere (today: none beyond what
`openTool`/`splitFocused` already assume about one-leaf-per-tool-id, since `apply` trusts its input
completely — a template is authored data, not user-typed input needing validation).

## The governing privacy rule

No part of this feature may cause a tool's content to outlive the `PersistencePolicy` that tool's own code
already declares. `snapshot()`/`restore()` only ever read/write storage keys the tool's own code already
owns under its own already-chosen policy — they never promote a `session`/`none`-policy value to something
longer-lived. See `DUDE_PRD.md` §14.1/§30 and the Phase 21 Item 4/5 amendment for the full rationale.
