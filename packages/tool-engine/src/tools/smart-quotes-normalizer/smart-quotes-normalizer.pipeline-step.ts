import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { DEFAULT_SMART_QUOTES_OPTIONS, normalizeSmartQuotes } from "./smart-quotes-normalize.js";

/**
 * Pipeline-step adapter for the Smart Quotes Normalizer tool. Always applies the component's own
 * default options (straighten quotes/dashes/ellipses) until per-step params ship (DUDE_PRD.md §21
 * Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Smart Quotes Normalizer expects text input.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: normalizeSmartQuotes(input.value, DEFAULT_SMART_QUOTES_OPTIONS) } };
  },
};
