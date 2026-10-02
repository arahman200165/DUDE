import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { sortLines } from "./line-order-logic.js";

/**
 * Pipeline-step adapter for the Line Order Tools tool. Always sorts ascending (the component's
 * own default operation/variant) until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Line Order Tools expects text input.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: sortLines(input.value, 'asc') } };
  },
};
