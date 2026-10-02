import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertYaml } from "./yaml-convert.js";

/**
 * Pipeline-step adapter for the YAML <-> JSON Converter tool. Always converts YAML text to a
 * `json` value — matches the tool's own default direction (`yaml-to-json`). Until per-step
 * params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select the reverse
 * (`json-to-yaml`) direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'YAML <-> JSON Converter expects text input.', kind: 'invalid-input' } };
    }

    const result = convertYaml(input.value, 'yaml-to-json', 2);
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: JSON.parse(result.output) } };
  },
};
