import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { DEV_SNIPPETS } from "./dev-snippets-data.js";
import { filterDevSnippets } from "./dev-snippets-search.js";

/**
 * Pipeline-step adapter for the Dev Snippets Reference tool. `filterDevSnippets` is a genuine
 * `search(query) -> results` pure function (matching the "static reference tool" guidance for
 * this batch), so this exposes it directly as `text -> json`: the input text is the search
 * filter, and the output is the matched entries grouped by category.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Dev Snippets Reference expects text input.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: filterDevSnippets(DEV_SNIPPETS, input.value) } };
  },
};
