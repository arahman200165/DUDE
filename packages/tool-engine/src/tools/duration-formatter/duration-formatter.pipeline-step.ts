import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseDuration } from "./duration-convert.js";

/**
 * Pipeline-step adapter for the Duration Parser / Formatter tool — parses a
 * human or ISO 8601 duration string into every representation at once.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Duration Parser / Formatter expects text input.', kind: 'invalid-input' } };
    }

    const result = parseDuration(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: result.result } };
  },
};
