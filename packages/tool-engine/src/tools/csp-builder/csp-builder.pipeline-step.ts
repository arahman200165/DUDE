import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseCsp } from "./csp.js";

/**
 * Pipeline-step adapter for the CSP Builder tool. Always parses raw `Content-Security-Policy:`
 * header text into a `{name, values}[]` json value — matches the tool's own "raw text ->
 * directives" direction. Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline
 * step cannot select the reverse (directives -> raw text) direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CSP Builder expects text input.', kind: 'invalid-input' } };
    }

    const directives = parseCsp(input.value);
    return { ok: true, output: { type: 'json', value: directives } };
  },
};
