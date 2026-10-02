import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { DEFAULT_META_SETTINGS, buildMetaTags } from "./meta-tag-logic.js";

/**
 * Pipeline-step adapter for the Meta Tag Generator. The piped text is used as the page
 * `<title>` — the field a plain string most naturally fits — with every other field (charset,
 * viewport, description, etc.) left at the tool's own defaults.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Meta Tag Generator expects text input.', kind: 'invalid-input' } };
    }

    const tags = buildMetaTags({ ...DEFAULT_META_SETTINGS, title: input.value.trim() });
    return { ok: true, output: { type: 'text', value: tags } };
  },
};
