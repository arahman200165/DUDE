# AGENTS.md — src/app/core/offline/

Web-companion offline machinery (DUDE_PRD.md §21 Phase 26 Items 1–5 and 10). Tool-agnostic: nothing here names a tool. Tools reach it only through their manifest's `capabilities` runtime declarations.

- `offline-map.model.ts` is the pure model and helpers for `offline-map.json`. That file is written at build time by `scripts/generate-offline-map.mjs`, which maps esbuild metafile outputs to tool ids and ngsw asset groups to their files, then re-runs `ngsw-config` so the map lands in the prefetched `app` group.
- `offline-readiness.service.ts` reports per-tool `ready | missing | unknown` and runs "Make available offline" by plain `fetch()` under the controlling service worker.
- `cache-inspector.service.ts` covers storage estimate/persistence, per-group sizes, and the two destructive actions: clear one runtime, and Repair installation.

## Rules

- **Stock `@angular/service-worker` only.** No custom service worker, and no writing to ngsw's caches except deleting entries, which ngsw tolerates by re-fetching lazily. Caching is always "fetch it and let ngsw store it".
- **Never touch user data.** localStorage, sessionStorage, and IndexedDB are out of bounds here. "Clear all local data" lives in Data & Privacy (`core/workspace/clear-all-data.ts`).
- **Destructive actions are two-step.** `plan*()` is pure. `execute(plan)` is the only mutator and is only called from an explicit Confirm. `cache-inspector.confirmation-boundary.spec.ts` guards this, so keep it green and extend it when adding an action.
- **Inert off the web.** On desktop (no service worker, runtimes shipped locally) and in dev builds, `enabled` is false and readiness is `'unknown'`, which every caller treats as available.
- Adding a runtime means updating `RuntimeId` (`shared/models/tool-capability.model.ts`), `RUNTIMES` (`core/platform/capability-catalog.ts`, which maps it to its ngsw asset group), `ngsw-config.json` (a lazy group), the conformance source patterns, and the doc generator labels.
