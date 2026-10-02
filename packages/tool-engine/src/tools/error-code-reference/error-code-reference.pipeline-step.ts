import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { ERROR_CODE_CATEGORIES, ERROR_CODES } from "./error-codes-data.js";
import { filterErrorCodes } from "./error-codes-search.js";

/**
 * Pipeline-step adapter for the Error Code Reference tool. `filterErrorCodes` takes a single
 * category plus a filter string, but the component only ever searches one category at a time --
 * this adapter instead searches across every category and merges the results, since a pipeline
 * step has no per-run "selected category" input yet (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Error Code Reference expects text input.', kind: 'invalid-input' } };
    }

    const matches = ERROR_CODE_CATEGORIES.flatMap((category) => filterErrorCodes(ERROR_CODES, category.id, input.value));
    return { ok: true, output: { type: 'json', value: matches } };
  },
};
