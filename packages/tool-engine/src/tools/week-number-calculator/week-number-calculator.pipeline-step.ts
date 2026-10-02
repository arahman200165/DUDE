import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { dateToWeek } from "./week-number-calc.js";

/**
 * Pipeline-step adapter for the Week Number Calculator — always the
 * date-to-week direction (the reverse direction takes three separate numeric
 * fields, not a single piped value).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Week Number Calculator expects text input.', kind: 'invalid-input' } };
    }

    const result = dateToWeek(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: result.info } };
  },
};
