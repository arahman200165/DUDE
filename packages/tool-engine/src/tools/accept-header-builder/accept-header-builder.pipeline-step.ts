import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseAcceptHeader } from "./accept-header.js";

/**
 * Pipeline-step adapter for the Accept Header Builder tool. Always parses raw `Accept:` header
 * text into a `{key (media type), value (q)}[]` json value — matches the tool's own
 * "raw text -> pairs" direction. Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a
 * pipeline step cannot select the reverse (pairs -> raw text) direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Accept Header Builder expects text input.', kind: 'invalid-input' } };
    }

    const pairs = parseAcceptHeader(input.value);
    return { ok: true, output: { type: 'json', value: pairs } };
  },
};
