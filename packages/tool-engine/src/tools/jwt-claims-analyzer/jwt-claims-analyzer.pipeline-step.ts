import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { decodeJwt } from "../jwt/jwt-decode.js";
import { analyzeClaims } from "./jwt-claims-analyzer-logic.js";

/** Pipeline-step adapter for the JWT Claims Analyzer tool. */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'JWT Claims Analyzer expects text input.', kind: 'invalid-input' } };
    }

    const decoded = decodeJwt(input.value);
    if (!decoded.ok) {
      return { ok: false, error: { message: decoded.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: analyzeClaims(decoded.header, decoded.payload) } };
  },
};
