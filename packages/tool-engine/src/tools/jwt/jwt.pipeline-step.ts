import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { decodeJwt } from "./jwt-decode.js";

/**
 * Pipeline-step adapter for the JWT Debugger tool — representative of a tool whose pure
 * transform already returns a rich, tool-specific result object rather than a bare `{ok,value}`
 * codec shape. The adapter's job is exactly this normalization step.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'JWT Debugger expects text input.', kind: 'invalid-input' } };
    }

    const result = decodeJwt(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return {
      ok: true,
      output: { type: 'json', value: { header: result.header, payload: result.payload, signature: result.signature } },
    };
  },
};
