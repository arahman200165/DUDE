import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { analyzeCharacters } from "./unicode-char-analyze.js";

/** Pipeline-step adapter for the Unicode Character Inspector tool. */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Unicode Character Inspector expects text input.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: analyzeCharacters(input.value) } };
  },
};
