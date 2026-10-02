import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { scanInvisibleChars } from "./invisible-char-scan.js";

/** Pipeline-step adapter for the Invisible / Control / Zero-Width Character Scanner tool. */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Invisible Char Scanner expects text input.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: scanInvisibleChars(input.value) } };
  },
};
