import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { inspectToken } from "./oauth-token-inspector-logic.js";

/**
 * Pipeline-step adapter for the OAuth Token Inspector tool — auto-detects a 3-segment JWT
 * shape and decodes it, or otherwise reports opaque-token facts.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'OAuth Token Inspector expects text input.', kind: 'invalid-input' } };
    }
    if (input.value.trim() === '') {
      return { ok: false, error: { message: 'Enter a token to inspect.', kind: 'invalid-input' } };
    }

    const inspection = inspectToken(input.value);
    return { ok: true, output: { type: 'json', value: inspection } };
  },
};
