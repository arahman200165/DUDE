import { PipelineStep, PipelineStepResult } from "@dude/contracts/shared/models/pipeline-step.model";
import { generatePassword } from "./password-generator-logic.js";

/**
 * Pipeline-step adapter for the Password / Passphrase Generator — a
 * generator-style step with no meaningful input (DUDE_PRD.md §21 Item 2's
 * pipeline batch migration guidance): the piped value is ignored and a
 * 20-character password using every character class is generated via the
 * tool's own CSPRNG, typically used to seed a chain.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['json'],
  produces: ['text'],
  async run(): Promise<PipelineStepResult> {
    try {
      const value = generatePassword({
        length: 20,
        useUppercase: true,
        useLowercase: true,
        useDigits: true,
        useSymbols: true,
        excludeAmbiguous: false,
      });
      return { ok: true, output: { type: 'text', value } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Password generation failed.', kind: 'execution-error' } };
    }
  },
};
