import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { DEFAULT_WHITESPACE_OPTIONS, cleanWhitespace } from "./whitespace-clean.js";

/**
 * Pipeline-step adapter for the Whitespace Cleaner / Normalizer tool. Always applies the
 * component's own default option set until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Whitespace Cleaner expects text input.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: cleanWhitespace(input.value, DEFAULT_WHITESPACE_OPTIONS) } };
  },
};
