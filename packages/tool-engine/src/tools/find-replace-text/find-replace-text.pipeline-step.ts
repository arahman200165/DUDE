import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { findReplace } from "./find-replace-logic.js";

/**
 * Pipeline-step adapter for the Find & Replace tool. The document to search is the single
 * pipeline input; `find`/`replace` are small config values, defaulted here to the component's own
 * defaults (empty strings, i.e. a no-op) until per-step params ship (DUDE_PRD.md §21 Item 2,
 * v1.1) lets a pipeline author supply them.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Find & Replace expects text input.', kind: 'invalid-input' } };
    }

    const result = findReplace(input.value, '', '', { caseSensitive: true, wholeWord: false });
    return { ok: true, output: { type: 'text', value: result.output } };
  },
};
