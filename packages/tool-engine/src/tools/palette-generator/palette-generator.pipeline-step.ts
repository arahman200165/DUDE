import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generatePalette } from "./palette-generator-logic.js";

/**
 * Pipeline-step adapter for the Palette Generator tool. Always generates a "complementary"
 * palette from the piped base color — until per-step params ship (DUDE_PRD.md §21 Item 2,
 * v1.1), a pipeline step can't select among the tool's six palette types.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Palette Generator expects text input.', kind: 'invalid-input' } };
    }

    const result = generatePalette(input.value, 'complementary');
    return result.ok
      ? { ok: true, output: { type: 'json', value: { colors: result.colors } } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
