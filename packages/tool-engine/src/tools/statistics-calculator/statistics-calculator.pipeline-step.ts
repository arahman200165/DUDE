import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { computeStatistics, parseNumberList } from "./statistics-calculate.js";

/**
 * Pipeline-step adapter for the Statistics Calculator tool. `parseNumberList` +
 * `computeStatistics` already take a single input value (a comma/whitespace-separated number
 * list), so this is a thin wrapper normalizing the summary object into a `json` value.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Statistics Calculator expects text input.', kind: 'invalid-input' } };
    }

    const values = parseNumberList(input.value);
    if (values === null) {
      return { ok: false, error: { message: 'Enter a comma- or whitespace-separated list of numbers.', kind: 'invalid-input' } };
    }

    const result = computeStatistics(values);
    return result.ok
      ? { ok: true, output: { type: 'json', value: result.value } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
