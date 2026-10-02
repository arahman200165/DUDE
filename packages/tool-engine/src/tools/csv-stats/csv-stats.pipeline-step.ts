import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { computeCsvStats } from "./csv-stats-compute.js";

/**
 * Pipeline-step adapter for the CSV Column Statistics tool. `computeCsvStats` only ever consumes
 * a plain CSV string, so `accepts` is narrowed to `text` here rather than the declared registry
 * `io`'s `['text', 'table']`.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CSV Column Statistics expects text input.', kind: 'invalid-input' } };
    }

    const result = computeCsvStats(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'table', value: result.table } };
  },
};
