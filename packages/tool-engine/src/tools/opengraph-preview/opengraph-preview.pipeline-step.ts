import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { DEFAULT_OG_SETTINGS, buildOgTags } from "./opengraph-logic.js";

/**
 * Pipeline-step adapter for the OpenGraph Preview tool. The piped text is used as the og:title
 * (and twitter:title) — the field a plain string most naturally fits — with every other field
 * left at the tool's own defaults (an empty description/image/url/site name, "website" type).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'OpenGraph Preview expects text input.', kind: 'invalid-input' } };
    }
    if (input.value.trim() === '') {
      return { ok: false, error: { message: 'Enter a title to build OpenGraph tags for.', kind: 'invalid-input' } };
    }

    const tags = buildOgTags({ ...DEFAULT_OG_SETTINGS, title: input.value.trim() });
    return { ok: true, output: { type: 'text', value: tags } };
  },
};
