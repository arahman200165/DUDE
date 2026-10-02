import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { sortJsonKeys } from "./json-sort-keys-transform.js";

/**
 * Pipeline-step adapter for the JSON Sort Keys tool. Always sorts recursively in ascending order
 * — the tool's own defaults — until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'json'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    const text = input.type === 'json' ? JSON.stringify(input.value) : input.type === 'text' ? input.value : null;
    if (text === null) {
      return { ok: false, error: { message: 'JSON Sort Keys expects text or JSON input.', kind: 'invalid-input' } };
    }

    const result = sortJsonKeys(text, true, 'asc');
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: JSON.parse(result.output) } };
  },
};
