import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { DEFAULT_SHADOW_LAYER, buildBoxShadowDeclaration } from "./box-shadow-logic.js";

/**
 * Pipeline-step adapter for the Box Shadow Generator. A shadow layer has several independent
 * numeric fields (offsets/blur/spread) plus a color, so the piped text is mapped onto the one
 * field a plain string naturally fits — the shadow color — with every other field left at the
 * tool's own default layer; an empty/whitespace-only input falls back to the default color too.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Box Shadow Generator expects text input.', kind: 'invalid-input' } };
    }

    const color = input.value.trim() === '' ? DEFAULT_SHADOW_LAYER.color : input.value.trim();
    const declaration = buildBoxShadowDeclaration([{ ...DEFAULT_SHADOW_LAYER, color }]);
    return { ok: true, output: { type: 'text', value: declaration } };
  },
};
