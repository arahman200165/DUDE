import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseCacheControl } from "./cache-control.js";

/**
 * Pipeline-step adapter for the Cache-Control Builder tool. Always parses raw `Cache-Control:`
 * header text into a `{name, value}[]` json value — matches the tool's own "raw text ->
 * directives" direction. Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline
 * step cannot select the reverse (directives -> raw text) direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Cache-Control Builder expects text input.', kind: 'invalid-input' } };
    }

    const entries = parseCacheControl(input.value);
    return { ok: true, output: { type: 'json', value: entries } };
  },
};
