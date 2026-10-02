import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { extractColumns } from "./extract-columns-logic.js";

/**
 * Pipeline-step adapter for the Extract Columns tool. Always uses the component's own default
 * options (comma-delimited, first column only) until per-step params ship (DUDE_PRD.md §21 Item
 * 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Extract Columns expects text input.', kind: 'invalid-input' } };
    }

    return {
      ok: true,
      output: { type: 'text', value: extractColumns(input.value, { delimiter: ',', columnSpec: '1', outputDelimiter: ',' }) },
    };
  },
};
