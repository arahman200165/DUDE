import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { DEFAULT_SLUG_OPTIONS, generateSlug } from "./slug-generate.js";

/**
 * Pipeline-step adapter for the Slug Generator tool. Turns the input text into a URL-friendly
 * slug using the component's own default options (hyphen separator, no length cap, stopwords
 * kept) until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Slug Generator expects text input.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: generateSlug(input.value, DEFAULT_SLUG_OPTIONS) } };
  },
};
