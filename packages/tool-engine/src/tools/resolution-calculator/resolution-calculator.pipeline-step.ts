import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { simplifyRatio } from "../../shared/utils/aspect-ratio.js";
import { megapixels, RESOLUTION_PRESETS } from "./resolution-calculator-logic.js";

/** Pipeline-step adapter for the Resolution Calculator tool. Parses a "WIDTHxHEIGHT" pixel resolution string, the same convention the component's own preset labels use. */
const DIMENSIONS_PATTERN = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i;

export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Resolution Calculator expects text input.', kind: 'invalid-input' } };
    }

    const match = input.value.trim().match(DIMENSIONS_PATTERN);
    if (!match) {
      return { ok: false, error: { message: 'Enter a resolution as "WIDTHxHEIGHT", e.g. 1920x1080.', kind: 'invalid-input' } };
    }

    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width <= 0 || height <= 0) {
      return { ok: false, error: { message: 'Width and height must both be positive numbers.', kind: 'invalid-input' } };
    }

    const matchingPreset = RESOLUTION_PRESETS.find((p) => p.width === width && p.height === height)?.name ?? null;
    const summary = `${megapixels(width, height).toFixed(2)} MP, aspect ratio ${simplifyRatio(width, height)}${matchingPreset ? ` (${matchingPreset})` : ''}`;

    return { ok: true, output: { type: 'text', value: summary } };
  },
};
