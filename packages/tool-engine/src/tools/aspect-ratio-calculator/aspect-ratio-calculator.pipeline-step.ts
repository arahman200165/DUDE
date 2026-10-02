import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { simplifyRatio } from "../../shared/utils/aspect-ratio.js";

/**
 * Pipeline-step adapter for the Aspect Ratio Calculator tool. Only implements the "simplify"
 * mode (the component's own default) since it is the one single-input direction: a "WxH" pixel
 * dimension string (the same widely-used convention `resolution-calculator.pipeline-step.ts`
 * parses) simplifies to a ratio like "16:9". The "solve for a missing dimension" mode needs a
 * target ratio plus a known dimension -- two independent values with no natural single-string
 * encoding -- so it is out of scope until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1).
 */
const DIMENSIONS_PATTERN = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i;

export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Aspect Ratio Calculator expects text input.', kind: 'invalid-input' } };
    }

    const match = input.value.trim().match(DIMENSIONS_PATTERN);
    if (!match) {
      return { ok: false, error: { message: 'Enter dimensions as "WIDTHxHEIGHT", e.g. 1920x1080.', kind: 'invalid-input' } };
    }

    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width <= 0 || height <= 0) {
      return { ok: false, error: { message: 'Width and height must both be positive numbers.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: simplifyRatio(width, height) } };
  },
};
