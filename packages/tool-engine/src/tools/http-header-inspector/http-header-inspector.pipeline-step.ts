import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseHeaders } from "./http-headers-codec.js";

/**
 * Pipeline-step adapter for the HTTP Header Inspector / Builder tool. Always parses raw header
 * text into an ordered `{key, value}[]` json value — matches the tool's own "raw text -> pairs"
 * direction. Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot
 * select the reverse (pairs -> raw text) direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'HTTP Header Inspector expects text input.', kind: 'invalid-input' } };
    }

    const pairs = parseHeaders(input.value);
    return { ok: true, output: { type: 'json', value: pairs } };
  },
};
