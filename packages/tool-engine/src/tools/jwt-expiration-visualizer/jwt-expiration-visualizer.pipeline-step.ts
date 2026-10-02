import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { decodeJwt } from "../jwt/jwt-decode.js";
import { JwtTimeline, buildTimeline } from "./jwt-expiration-visualizer-logic.js";

/** `JwtTimeline`'s iat/nbf/exp are live `Date` objects; `PipelineValue` json payloads must be JSON-serializable (see `pipeline-step.model.ts`), so they're converted to ISO strings here. */
function toJson(timeline: JwtTimeline): unknown {
  return {
    ...timeline,
    iat: timeline.iat?.toISOString(),
    nbf: timeline.nbf?.toISOString(),
    exp: timeline.exp?.toISOString(),
  };
}

/** Pipeline-step adapter for the JWT Expiration Visualizer tool. */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'JWT Expiration Visualizer expects text input.', kind: 'invalid-input' } };
    }

    const decoded = decodeJwt(input.value);
    if (!decoded.ok) {
      return { ok: false, error: { message: decoded.error, kind: 'invalid-input' } };
    }

    const timeline = buildTimeline(decoded.payload);
    if (!timeline.ok) {
      return { ok: false, error: { message: timeline.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: toJson(timeline.timeline) } };
  },
};
