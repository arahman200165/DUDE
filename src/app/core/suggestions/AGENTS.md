# AGENTS.md — src/app/core/suggestions/

Framework layer for Related-Tool Suggestions and Pipeline Suggestions (`DUDE_PRD.md` §21 Phase 24
Items 9/10). Like the rest of `core/`, no file here ever names a specific tool by id.

## Presentation-layer ranking, never a new capability

Everything here computes a ranking over metadata every tool already declares (`ToolDefinition.io`,
whether a `<id>.pipeline-step.ts` adapter loaded, `UsageService`'s frequency counters) — it never
adds a new field to `ToolDefinition`, never infers relatedness from anything but the existing
Universal I/O Contract, and never runs a tool's transform itself. `related-tools.ts` reuses
`core/pipeline/pipeline-compatibility.ts#canChain` — the same "can A feed B" check Pipelines'
builder and runner already use — rather than a second, parallel compatibility notion.

## Direction matters: "next useful action," not "anything similar"

`relatedTools` only surfaces a candidate the current tool could actually *feed*
(`current.io.produces` overlapping `candidate.io.accepts`), not the reverse. This matches the PRD's
own framing ("next useful action recommendations") — a JSON Formatter suggests what to do *with*
formatted JSON next, not everything upstream that could have produced JSON in the first place.

## Why the pipeline-eligibility boost, not a hard requirement

A tool can be genuinely related by `io` alone even without a `<id>.pipeline-step.ts` adapter (e.g.
`diff`, deliberately excluded from Pipelines for being multi-input — see `core/pipeline/AGENTS.md`).
Requiring both tools to be pipeline-eligible would silently drop real, useful suggestions for the
~52 pipeline-ineligible tools. Instead, pipeline eligibility is only a ranking *boost* — "these two
can be formally chained into a saved pipeline, not just conceptually related."

## Never call `PipelineStepRegistryService.ensureLoaded()` from here

`RelatedToolsPanel` (`shared/components/related-tools-panel/`) reads
`PipelineStepRegistryService.eligibleToolIds()` as-is and never calls its own `ensureLoaded()`. That
panel mounts inside `ToolShell` — i.e. on every single tool page — so forcing the eager load there
would mean visiting *any* tool triggers ~225 extra dynamic-import chunk loads (one per pipeline-step
adapter) just to power an optional ranking boost. An earlier version of this panel did call
`ensureLoaded()` in its constructor and it broke ~42 unrelated component specs across the app (any
test mounting a real `ToolShell` route now raced 225 dynamic imports against its own teardown) before
being caught and reverted. Leave the cache to warm up naturally whenever something that genuinely
needs it (the Pipeline Builder's "add step" picker) loads it first — the boost then applies for free
on every subsequent panel render, with zero cost to tool pages that never trigger it.
