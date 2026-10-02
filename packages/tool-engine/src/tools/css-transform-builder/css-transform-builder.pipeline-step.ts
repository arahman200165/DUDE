import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { DEFAULT_TRANSFORM_STATE, buildTransformDeclaration } from "./css-transform-logic.js";

/**
 * Pipeline-step adapter for the CSS Transform Builder. The piped text is parsed as a single
 * number and applied as the rotation angle (degrees) — the tool's other axes (translate/scale/
 * skew) stay at their identity defaults; a non-numeric or empty input leaves every field at the
 * tool's own default state (`transform: none;`).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CSS Transform Builder expects text input.', kind: 'invalid-input' } };
    }

    const parsed = Number(input.value.trim());
    const rotate = input.value.trim() !== '' && Number.isFinite(parsed) ? parsed : DEFAULT_TRANSFORM_STATE.rotate;

    return { ok: true, output: { type: 'text', value: buildTransformDeclaration({ ...DEFAULT_TRANSFORM_STATE, rotate }) } };
  },
};
