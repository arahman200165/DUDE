import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { addLineNumbers } from "./line-prefix-numbering-logic.js";

/**
 * Pipeline-step adapter for the Line Prefix/Suffix & Numbering tool. Always adds line numbers
 * (the component's own default `numberOptions`) rather than prefix/suffix, number-removal, or
 * per-line transform, until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Line Prefix/Numbering expects text input.', kind: 'invalid-input' } };
    }

    return {
      ok: true,
      output: { type: 'text', value: addLineNumbers(input.value, { start: 1, padded: false, separator: '. ' }) },
    };
  },
};
