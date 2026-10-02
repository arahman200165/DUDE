import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { buildBearerHeader } from "./bearer-token-builder-logic.js";

/**
 * Pipeline-step adapter for the Bearer Token Builder tool — wraps a raw token into a
 * properly formatted `Bearer <token>` Authorization header, with RFC 6750 charset validation
 * surfaced as a warning rather than a hard failure (matching the tool's own behavior).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Bearer Token Builder expects text input.', kind: 'invalid-input' } };
    }

    const result = buildBearerHeader(input.value);
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.value.header } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
