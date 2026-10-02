import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseUrl } from "./url-parts.js";

/**
 * Pipeline-step adapter for the URL / URI Inspector tool. Always parses (never rebuilds) —
 * matches the tool's own "raw URL -> component breakdown" direction. Until per-step params
 * ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select the reverse
 * (edited parts -> rebuilt URL) direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'url'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text' && input.type !== 'url') {
      return { ok: false, error: { message: 'URL / URI Inspector expects text or url input.', kind: 'invalid-input' } };
    }

    const result = parseUrl(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: result.parts } };
  },
};
