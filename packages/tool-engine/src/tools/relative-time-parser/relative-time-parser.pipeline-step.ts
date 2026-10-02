import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseRelativeText } from "./relative-time-parser-logic.js";

/**
 * Pipeline-step adapter for the Relative Time Parser — always the
 * text-to-timestamp direction ("3 days ago" -> an ISO 8601 instant),
 * matching the tool's own description. The reverse direction (timestamp ->
 * relative text) takes a separate reference-time field, so it isn't exposed
 * here.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Relative Time Parser expects text input.', kind: 'invalid-input' } };
    }

    const result = parseRelativeText(input.value, Date.now());
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: result.iso } };
  },
};
