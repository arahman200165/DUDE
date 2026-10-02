import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { MIME_TYPES } from "./mime-type-data.js";
import { COMMON_MIME_EXTENSIONS } from "./mime-extension-overlay.js";
import { filterMimeTypes } from "./mime-search.js";

/**
 * Pipeline-step adapter for the MIME Type Reference tool. A genuine lookup function (filter
 * text -> matching MIME-type rows, with an exact-extension overlay) over the tool's static
 * reference table, rather than a transform of the input value itself. Always searches every
 * top-level type — matches the tool's own default filter.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'MIME Type Reference expects text input.', kind: 'invalid-input' } };
    }

    const result = filterMimeTypes(MIME_TYPES, COMMON_MIME_EXTENSIONS, { text: input.value, topLevelType: 'all' });
    return { ok: true, output: { type: 'json', value: result } };
  },
};
