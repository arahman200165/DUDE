# AGENTS.md — src/app/core/backup/

Export/import bundle (DUDE_PRD.md §21 Phase 26 Item 14). It gives web users a backup against browser storage eviction and a manual web ↔ desktop move ahead of Phase 59's real hand-off. Identical on both platforms.

- `dude-bundle.model.ts`: the pure model. `parseBundle` validates, never throws, and drops/counts malformed entries. `planImport` resolves id conflicts: skip / replace / keep-both. keep-both rewrites pipeline/script references.
- `dude-bundle.service.ts`: `build` (export), `preview` (pure), `apply` (writes exactly a previewed plan).
- `upsert-by-id.ts`: the shared upsert behind each store's `import*` method.

## Rules

- **Never exported:** consent decisions, `secure-local`/keychain secrets, History, usage stats, and any storage namespace that isn't a registered tool (e.g. the app-level `settings` namespace holding the AI provider config).
- **Import re-enforces the boundary; it doesn't trust the file.** Preferences are written only for registered tool ids, safe key names, and valid JSON, never a tool's declared input key. Inputs are written only through each tool's own declared policy and flagged as imported (`recordImportedFileFlags`). `dude-bundle.service.spec.ts` has a tampered-bundle test; keep it passing.
- **Imported user scripts arrive `imported: true`** and are blocked in pipelines (`PipelineStepGateService`) until the user explicitly marks them reviewed in the script editor. An import must never make someone else's code runnable as a side effect.
- **Two-step.** The UI (Settings › Data & Privacy) shows `preview()`'s plan and writes only on an explicit Import confirm.
- Adding a store to the bundle means an `import*` upsert on that store, a guard in the model, and a line in the preview UI.
