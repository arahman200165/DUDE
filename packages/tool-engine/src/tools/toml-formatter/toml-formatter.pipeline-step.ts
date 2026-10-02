import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { processToml } from "./toml-format.js";

/**
 * Pipeline-step adapter for the TOML Formatter / Validator tool. Always formats (the tool's own
 * default mode) rather than the `validate` mode, which just echoes the input back unchanged.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'TOML Formatter / Validator expects text input.', kind: 'invalid-input' } };
    }

    const result = processToml(input.value, 'format');
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: result.output } };
  },
};
