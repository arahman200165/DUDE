import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseCurl } from "./curl-parse.js";

/**
 * Pipeline-step adapter for the cURL Command Inspector / Converter tool. Always parses a raw
 * cURL command into its `ParsedHttpRequest` shape as `json` — matches the tool's own "paste ->
 * inspect" direction. Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step
 * cannot select the reverse (request -> cURL command) direction, nor the 15-language code export.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'cURL Command Inspector expects text input.', kind: 'invalid-input' } };
    }

    const result = parseCurl(input.value);
    if (result.error !== null) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: result.request } };
  },
};
