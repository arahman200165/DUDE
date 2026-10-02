import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { checkContrast } from "./contrast-checker-logic.js";

/**
 * Pipeline-step adapter for the Contrast Checker tool. WCAG contrast needs two colors, which
 * doesn't fit a single piped value — the piped text is used as the foreground, checked against
 * the tool's own default background (`#ffffff`, its initial "background" field value).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Contrast Checker expects text input.', kind: 'invalid-input' } };
    }

    const result = checkContrast(input.value, '#ffffff');
    return result.ok
      ? { ok: true, output: { type: 'json', value: { ratio: result.ratio, compliance: result.compliance } } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
