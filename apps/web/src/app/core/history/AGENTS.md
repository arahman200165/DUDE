# AGENTS.md — apps/web/src/app/core/history/

Framework layer for Persistent Local History (`DUDE_PRD.md` §21 Phase 21 Item 5). Like the rest of
`core/`, no file here ever names a specific tool by id.

## Eligibility: explicit opt-in, default ineligible

History reuses the exact same `<id>.workspace-step.ts` adapter Workspace does (`core/workspace/`) —
no second loader, no second per-tool file. A tool becomes History-eligible only by explicitly
setting `historyEligible: true` on its `workspaceStep` export; absent or `false` means never
recorded, and a tool with no adapter file at all is automatically excluded too, at zero extra cost.

**This is deliberately not inferred from the tool's own `PersistencePolicy`.** `persistence.input`
answers a narrower question — "does this survive a refresh, inside this one tool" — than History's
actual question: "should this sit in a global, searchable, cross-tool feed indefinitely." Deriving
one from the other would be exactly the silent-default `DUDE_PRD.md` §30 forbids. Concretely,
`base64`'s `input` is `'session'`-policy — a deliberate "don't outlive this session" choice — and an
automatic scheme admitting `session`-policy tools would silently override that choice the instant
History shipped. `historyEligible` is a fresh, deliberate declaration, mirroring how `persistence`
itself is declared, not a value derived from it.

## Exclusion categories (checked as part of the Milestone 296-297 mechanical retrofit)

Different from Pipelines' exclusion list (`core/pipeline/pipeline-coverage.spec.ts`), since the
criterion here is sensitivity/meaningfulness, not call-arity:

- **Sensitive-by-design (§30).** JWT tools, signing/crypto tools needing a caller-supplied key,
  PEM/CSR/SSH/PKCS12 tools, Password/Passphrase Generator (its *output* is a credential, even
  though it's a "generator"), Secret Detector, Basic Auth/Bearer Token Builder, kubeconfig/AWS
  SigV4 inspectors.
- **Reference/lookup tools** with nothing to remember (HTTP Status Reference, MIME Type Reference,
  ASCII/Unicode Table, etc.) — there's no conversion, just table browsing.
- **Sandboxed execution tools** (JS/HTML/Template/Python Playgrounds): eligible for source text
  only — the snapshot must exclude console/execution output — and `restore()` for these must only
  repopulate the editor, **never** auto-re-execute.
- **Unlike Pipelines, multi-input tools and network-dependent tools are generally *not* excluded.**
  History's `snapshot()` has no unary-input constraint the way `PipelineStep.run(input)` does, so
  Text Diff, JSON Merge, curl-converter etc. are good candidates, opted in per-tool.

## Storage

IndexedDB (`history-db.ts`, database `dude:v1:history`), not `PersistenceService` — a growing log of
past entries doesn't fit its "one JSON blob per key" model. `core/storage/indexed-db.ts` holds the
generic Promise-wrapped native `indexedDB` primitives this and nothing else in Workspace currently
needs (see `core/workspace/AGENTS.md`'s "why there is no separate durable content tier").
Retention (per-tool/global/age/size caps) lives in `history.model.ts` and is enforced in
`history.service.ts#enforceRetention` after every write — see DUDE_PRD.md §29 "fail clearly."

`HistoryService.clearAll()` is folded into `core/workspace/clear-all-data.ts#ClearAllDataService`,
not into `PersistenceService` itself, which stays a localStorage/sessionStorage abstraction only.

## Unified Recents reads `HistoryService.recent()`, never records a second copy

`core/recents/UnifiedRecentsService` (Phase 24 Item 13) surfaces History entries alongside
tool/pipeline/workspace-tab activity in one merged view — it only ever reads `history.recent()`
reactively. History's own eligibility rules (opt-in `historyEligible`, exclusion categories above)
are untouched and still fully govern what content-bearing entries exist at all; Unified Recents just
renders whatever already passed that bar, with the same title/timestamp every History row has.

## Capture and restore

`history-recorder.ts#recordHistoryOnDestroy` is called from `ToolShell.ngOnDestroy` — the one
shared component every tool renders through — so it fires the same way whether a tool was torn
down by leaving its own route or by the Workspace swapping a panel's tool. `history-handoff.service.ts`
mediates click-to-restore, calling the same `workspaceStep.restore()` `ToolHost` uses for tab
reopen — never a second parallel hand-off mechanism.
