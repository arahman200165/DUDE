import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseCorsHeaderText } from "./cors-headers.js";

/**
 * Pipeline-step adapter for the CORS Header Builder tool. Always parses a raw block of CORS
 * response headers into a single structured json value — matches the tool's own "raw text ->
 * fields" direction. Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step
 * cannot select the reverse (fields -> raw text) direction, nor the separate preflight check.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CORS Header Builder expects text input.', kind: 'invalid-input' } };
    }

    const cors = parseCorsHeaderText(input.value);
    return { ok: true, output: { type: 'json', value: cors } };
  },
};
