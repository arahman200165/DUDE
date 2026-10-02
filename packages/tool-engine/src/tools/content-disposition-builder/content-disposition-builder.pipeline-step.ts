import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseContentDisposition } from "./content-disposition.js";

/**
 * Pipeline-step adapter for the Content-Disposition Builder tool. Always parses raw
 * `Content-Disposition:` header text into a `{type, filename}` json value — matches the tool's
 * own "raw text -> fields" direction. Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1),
 * a pipeline step cannot select the reverse (fields -> raw text) direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Content-Disposition Builder expects text input.', kind: 'invalid-input' } };
    }

    const disposition = parseContentDisposition(input.value);
    return { ok: true, output: { type: 'json', value: disposition } };
  },
};
