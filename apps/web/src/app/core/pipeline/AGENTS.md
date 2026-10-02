# AGENTS.md — apps/web/src/app/core/pipeline/

Framework layer for Transformation Pipelines (DUDE_PRD.md §21 Phase 21 Item 2). Like the rest of `core/`, no file here ever names a specific tool by id.

## The `<id>.pipeline-step.ts` convention

A pipeline-eligible tool exposes itself by placing a file at `packages/tool-engine/src/tools/<id>/<id>.pipeline-step.ts` (portable) or `apps/web/src/app/tools/<id>/<id>.pipeline-step.ts` (host adapter) that exports `pipelineStep: PipelineStep` (`packages/contracts/src/shared/models/pipeline-step.model.ts`). `pipeline-step-loader.ts`'s `loadPipelineStep(id)` uses a generated map of literal lazy imports discovered from adapter files. No hand-maintained registration is required. This keeps `TOOL_DEFINITIONS` untouched by this feature and means a folder rename can't leave a stale registry entry behind, at the cost of one extra file per participating tool. A tool with no such file (most commonly: it needs more than one input — diff/merge/join — or requires network) simply isn't pipeline-eligible; `loadPipelineStep` returns `undefined` and callers treat that as "not available as a step," never an error.

`loadPipelineStep` also asserts, in dev mode, that a resolved step's `accepts`/`produces` are subsets of the owning `ToolDefinition.io.accepts`/`.produces` — this is what finally makes the previously-declarative `io` field runtime-meaningful. A dev-console warning here almost always means the tool's `io` metadata has drifted from what its adapter actually does; fix whichever one is wrong, the same judgment call the Milestone 282 audit already made for 34 tools.

## Writing a `.pipeline-step.ts` adapter

It is a **thin wrapper**, never a rewrite of the tool's existing pure transform. Normalize whatever result shape that transform already returns (`{ok,value}|{ok,error}`, a bare string, a richer object) into `PipelineStepResult`; never let it throw. See `packages/tool-engine/src/tools/base64/base64.pipeline-step.ts`, `packages/tool-engine/src/tools/json/json.pipeline-step.ts`, and `packages/tool-engine/src/tools/jwt/jwt.pipeline-step.ts` for the three representative shapes (simple codec, worker-eligible, rich-object result).

## Execution and validation

`pipeline-compatibility.ts` holds the pure `canChain(a, b)` check (`accepts`/`produces` intersection) that both the pipeline builder's live UI warnings and `PipelineRunnerService`'s pre-flight check call — one source of truth for "is this pipeline runnable," never duplicated.

## Command Palette source (Phase 25 Item 4)

`pipeline-command-source.ts`'s `PipelineCommandSource` is one `CommandSource` (`shared/models/command-source.model.ts`) registered via the multi-provider `COMMAND_SOURCE` token, alongside `ToolCommandSource`/`WorkspaceCommandSource`/`ProjectCommandSource`. It is deliberately navigate-only — opening the builder at `/pipelines/:id`, never running the pipeline — until a direct "run" command can go through `PipelineConfirmationService`'s confirmation gate (`core/pipeline/pipeline-confirmation.service.ts`), the same gate deep links already use.

## Browser-safe execution (Phase 26 Item 13)

- The runner passes every step a `PipelineStepContext`. `signal` is aborted by `cancel()`, which now stops a step mid-run. `offload` accepts a neutral execution request; the Angular browser adapter selects the generated worker factory and delegates to `WorkerClientService.runAsync`. A step must still work when called bare (unit tests), so fall back to inline computation when `offload` is absent. Hash and JSON are the reference adopters.
- `MAX_PIPELINE_VALUE_CHARS` caps any intermediate value. It is identical on web and desktop.
- `PipelineStepGateService` is the one "can this step run here, now" check, used by both the builder's live warnings and the runner's pre-flight. It blocks: offline with the step's code or declared runtime uncached, and imported user scripts not yet reviewed. It deliberately doesn't block on a tool's desktop-only *platform* capability, since steps run shared-core logic only (the parity suite enforces that).
