import { PipelineStep, PipelineStepResult } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateAsymmetricKeyPair } from "./asymmetric-keygen-logic.js";

/**
 * Pipeline-step adapter for the Asymmetric Key Generator — a generator-style
 * step with no meaningful input (DUDE_PRD.md §21 Item 2's pipeline batch
 * migration guidance): the piped value is ignored and a fresh RSA-2048 key
 * pair is generated (matching the tool's own default family), typically used
 * to seed a chain such as CSR Generator or JWT Signer.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['json'],
  produces: ['json'],
  async run(): Promise<PipelineStepResult> {
    try {
      const pair = await generateAsymmetricKeyPair({ family: 'rsa', modulusLength: 2048 });
      return { ok: true, output: { type: 'json', value: pair } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Key generation failed.', kind: 'execution-error' } };
    }
  },
};
