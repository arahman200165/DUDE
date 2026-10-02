import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { BEZIER_PRESETS, buildCubicBezierValue, validateBezierPoints } from "./cubic-bezier-logic.js";

/**
 * Pipeline-step adapter for the Cubic-Bezier Editor. The piped text is matched against the
 * tool's own named presets (`ease`, `ease-in`, ...); an unrecognized or empty value falls back
 * to `ease`, the CSS spec's own default timing-function keyword.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Cubic-Bezier Editor expects text input.', kind: 'invalid-input' } };
    }

    const preset = BEZIER_PRESETS.find((p) => p.name === input.value.trim()) ?? BEZIER_PRESETS.find((p) => p.name === 'ease')!;
    const validation = validateBezierPoints(preset.points);
    if (!validation.ok) {
      return { ok: false, error: { message: validation.error, kind: 'execution-error' } };
    }

    return { ok: true, output: { type: 'text', value: buildCubicBezierValue(preset.points) } };
  },
};
