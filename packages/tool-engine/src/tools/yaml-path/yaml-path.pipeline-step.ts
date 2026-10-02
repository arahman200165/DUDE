import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { evaluateYamlPath } from "./yaml-path-eval.js";

/**
 * Pipeline-step adapter for the YAML Path Tester tool. The query is a small config value
 * alongside the flowing YAML document (like `csv-viewer`'s delimiter), not a second document —
 * fixed to the JSONPath root selector `$`, which resolves the whole document for any input and
 * therefore has a universally sensible default (unlike `json-pointer`/`xml-xpath`, whose
 * languages have no equivalent "whole document" selector that isn't rejected outright). Until
 * per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select a different
 * query or the JMESPath language.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'YAML Path Tester expects text input.', kind: 'invalid-input' } };
    }

    const result = evaluateYamlPath(input.value, '$', 'jsonpath');
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    let value: unknown;
    try {
      value = JSON.parse(result.output);
    } catch {
      value = null;
    }
    return { ok: true, output: { type: 'json', value } };
  },
};
