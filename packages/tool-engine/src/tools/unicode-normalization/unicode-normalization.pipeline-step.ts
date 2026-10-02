import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { normalizeText } from "./unicode-normalize.js";

/**
 * Pipeline-step adapter for the Unicode Normalization tool. Always normalizes to NFC (the
 * component's own default form) until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Unicode Normalization expects text input.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: normalizeText(input.value, 'NFC').output } };
  },
};
