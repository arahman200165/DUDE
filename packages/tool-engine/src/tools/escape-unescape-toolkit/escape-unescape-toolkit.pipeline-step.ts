import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { escapeText } from "./escape-unescape.js";

/**
 * Pipeline-step adapter for the Escape / Unescape Toolkit. Always escapes for JavaScript string
 * literals — the tool's own default syntax and direction. Until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select a different syntax or the
 * unescape direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Escape / Unescape Toolkit expects text input.', kind: 'invalid-input' } };
    }

    const result = escapeText(input.value, 'javascript');
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.value } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
