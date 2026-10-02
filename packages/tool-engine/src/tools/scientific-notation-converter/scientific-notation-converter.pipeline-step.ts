import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertScientific } from "./scientific-notation-convert.js";

/**
 * Pipeline-step adapter for the Scientific Notation Converter. `convertScientific` already takes
 * a single input value (a number, with the significant-digits count defaulting to 6, the tool's
 * own default), so this is a thin wrapper that surfaces the scientific-notation form as text.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Scientific Notation Converter expects text input.', kind: 'invalid-input' } };
    }

    const result = convertScientific(input.value);
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.value.scientific } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
