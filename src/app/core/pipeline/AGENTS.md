# AGENTS.md — src/app/core/pipeline/

Framework layer for Transformation Pipelines (DUDE_PRD.md §21 Phase 21 Item 2). Like the rest of `core/`, no file here ever names a specific tool by id.

## The `<id>.pipeline-step.ts` convention

A pipeline-eligible tool exposes itself by placing a file at `src/app/tools/<id>/<id>.pipeline-step.ts` that exports `pipelineStep: PipelineStep` (`src/app/shared/models/pipeline-step.model.ts`). `pipeline-step-loader.ts`'s `loadPipelineStep(id)` finds it purely by string convention — a template-literal dynamic import built from `id` — never via a hand-maintained field on `ToolDefinition` or a parallel `id -> step` map. This keeps `TOOL_DEFINITIONS` untouched by this feature and means a folder rename can't leave a stale registry entry behind, at the cost of one extra file per participating tool. A tool with no such file (most commonly: it needs more than one input — diff/merge/join — or requires network) simply isn't pipeline-eligible; `loadPipelineStep` returns `undefined` and callers treat that as "not available as a step," never an error.

`loadPipelineStep` also asserts, in dev mode, that a resolved step's `accepts`/`produces` are subsets of the owning `ToolDefinition.io.accepts`/`.produces` — this is what finally makes the previously-declarative `io` field runtime-meaningful. A dev-console warning here almost always means the tool's `io` metadata has drifted from what its adapter actually does; fix whichever one is wrong, the same judgment call the Milestone 282 audit already made for 34 tools.

## Writing a `.pipeline-step.ts` adapter

It is a **thin wrapper**, never a rewrite of the tool's existing pure transform. Normalize whatever result shape that transform already returns (`{ok,value}|{ok,error}`, a bare string, a richer object) into `PipelineStepResult`; never let it throw. See `src/app/tools/base64/base64.pipeline-step.ts`, `src/app/tools/json/json.pipeline-step.ts`, and `src/app/tools/jwt/jwt.pipeline-step.ts` for the three representative shapes (simple codec, worker-eligible, rich-object result).

## Execution and validation

`pipeline-compatibility.ts` holds the pure `canChain(a, b)` check (`accepts`/`produces` intersection) that both the pipeline builder's live UI warnings and `PipelineRunnerService`'s pre-flight check call — one source of truth for "is this pipeline runnable," never duplicated.

## Command Palette source (Phase 25 Item 4)

`pipeline-command-source.ts`'s `PipelineCommandSource` is one `CommandSource` (`shared/models/command-source.model.ts`) registered via the multi-provider `COMMAND_SOURCE` token, alongside `ToolCommandSource`/`WorkspaceCommandSource`/`ProjectCommandSource`. It is deliberately navigate-only — opening the builder at `/pipelines/:id`, never running the pipeline — until a direct "run" command can go through `PipelineConfirmationService`'s confirmation gate (`core/pipeline/pipeline-confirmation.service.ts`), the same gate deep links already use.
