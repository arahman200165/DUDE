import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseRangeHeader } from "./range-header.js";

/**
 * Pipeline-step adapter for the Range Header Builder tool. Always parses a raw request
 * `Range:` header into a `{key (start), value (end)}[]` json value — matches the tool's own
 * "raw text -> ranges" direction. Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a
 * pipeline step cannot select the reverse direction, nor the separate Content-Range parse/build.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Range Header Builder expects text input.', kind: 'invalid-input' } };
    }

    const ranges = parseRangeHeader(input.value);
    return { ok: true, output: { type: 'json', value: ranges } };
  },
};
