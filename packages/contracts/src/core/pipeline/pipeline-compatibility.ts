import { DudeDataType } from "@dude/shared-types/shared/models/tool-io.model";

export interface PipelineStepIo {
  readonly accepts: readonly DudeDataType[];
  readonly produces: readonly DudeDataType[];
}

/**
 * Whether a step producing `upstream`'s types could feed a step accepting `downstream`'s types —
 * an optimistic union check (at least one overlapping type), since a multi-`produces` step's
 * *actual* runtime output type is only known after it runs (see `PipelineRunnerService`, which
 * re-checks the concrete type after each step). The single source of truth for "is this pipeline
 * runnable," called by both the builder's live validation and the runner's pre-flight check.
 */
export function canChain(upstream: PipelineStepIo, downstream: PipelineStepIo): boolean {
  return upstream.produces.some((type) => downstream.accepts.includes(type));
}

export function compatibleTypes(upstream: PipelineStepIo, downstream: PipelineStepIo): readonly DudeDataType[] {
  return upstream.produces.filter((type) => downstream.accepts.includes(type));
}
