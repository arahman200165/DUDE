import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { analyzePassword } from "./password-strength-logic.js";

/**
 * Pipeline-step adapter for the Password Strength & Entropy Analyzer.
 * `analyzePassword` never fails (an empty string just scores "very-weak"),
 * so this adapter only ever returns `ok: true` for text input.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Password Strength Analyzer expects text input.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: analyzePassword(input.value) } };
  },
};
