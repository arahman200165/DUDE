import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertEnvJson } from "./env-json-converter-logic.js";

/**
 * Pipeline-step adapter for the .env ↔ JSON tool. Always converts env -> JSON (the tool's own
 * default direction) — until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline
 * step cannot select the reverse direction. Produces a `json` value (parsing the tool's own
 * `JSON.stringify`d output) rather than the redundant `text` alternative also listed in the
 * tool's declared `produces`.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: '.env ↔ JSON expects text input.', kind: 'invalid-input' } };
    }

    const result = convertEnvJson(input.value, 'env-to-json');
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: JSON.parse(result.output) } };
  },
};
