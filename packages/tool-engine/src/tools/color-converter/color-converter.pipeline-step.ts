import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseColor } from "./color-convert.js";

/**
 * Pipeline-step adapter for the Color Converter tool. Parses the input as a CSS color and
 * produces every supported format as a single `json` value.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Color Converter expects text input.', kind: 'invalid-input' } };
    }

    const result = parseColor(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: result.formats } };
  },
};
