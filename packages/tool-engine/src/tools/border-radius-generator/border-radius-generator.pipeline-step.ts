import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { DEFAULT_CORNERS, buildBorderRadiusDeclaration } from "./border-radius-logic.js";

/**
 * Pipeline-step adapter for the Border Radius Generator. The piped text is parsed as a single
 * number and applied uniformly to all four corners (in `px`, the tool's own default unit); a
 * non-numeric or empty input falls back to the tool's default radius (16px, all corners).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Border Radius Generator expects text input.', kind: 'invalid-input' } };
    }

    const parsed = Number(input.value.trim());
    const radius = input.value.trim() !== '' && Number.isFinite(parsed) ? parsed : DEFAULT_CORNERS.topLeft;
    const corners = { topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius };

    return { ok: true, output: { type: 'text', value: buildBorderRadiusDeclaration(corners, 'px') } };
  },
};
