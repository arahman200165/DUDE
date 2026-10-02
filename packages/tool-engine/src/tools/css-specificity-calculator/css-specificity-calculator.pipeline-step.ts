import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { rankSelectors } from "./css-specificity-logic.js";

/**
 * Pipeline-step adapter for the CSS Specificity Calculator / Comparer tool — scores a
 * comma-separated selector list and ranks each one, most specific first.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CSS Specificity Calculator expects text input.', kind: 'invalid-input' } };
    }
    if (input.value.trim() === '') {
      return { ok: false, error: { message: 'Enter one or more CSS selectors.', kind: 'invalid-input' } };
    }

    const ranked = rankSelectors(input.value);
    return { ok: true, output: { type: 'json', value: { ranked } } };
  },
};
