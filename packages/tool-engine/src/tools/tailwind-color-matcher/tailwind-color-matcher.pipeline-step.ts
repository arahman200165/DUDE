import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { findClosestTailwindColors } from "./tailwind-color-matcher-logic.js";

/**
 * Pipeline-step adapter for the Tailwind Color Matcher tool — finds the nearest Tailwind CSS
 * v4 default-palette colors to an arbitrary color, ranked by OKLab perceptual distance.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Tailwind Color Matcher expects text input.', kind: 'invalid-input' } };
    }

    const result = findClosestTailwindColors(input.value);
    return result.ok
      ? { ok: true, output: { type: 'json', value: { matches: result.matches } } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
