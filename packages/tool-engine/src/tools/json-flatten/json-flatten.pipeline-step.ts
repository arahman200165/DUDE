import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { flattenJson } from "./json-flatten-transform.js";

/**
 * Pipeline-step adapter for the JSON Flatten / Unflatten tool. Always flattens (the tool's own
 * default direction) — until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step
 * cannot select the reverse `unflatten` direction. Normalizes both `text` and `json` input into
 * the string the transform expects, and parses its (always-valid-JSON) string output back into a
 * `json` value, matching the `json` tool's own reference adapter.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'json'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    const text = input.type === 'json' ? JSON.stringify(input.value) : input.type === 'text' ? input.value : null;
    if (text === null) {
      return { ok: false, error: { message: 'JSON Flatten / Unflatten expects text or JSON input.', kind: 'invalid-input' } };
    }

    const result = flattenJson(text, 'flatten');
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: JSON.parse(result.output) } };
  },
};
