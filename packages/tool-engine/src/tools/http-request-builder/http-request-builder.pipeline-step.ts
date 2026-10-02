import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseHttpRequestText } from "./http-request-parse.js";

/**
 * Pipeline-step adapter for the HTTP Request Builder / Converter tool. Always parses a raw
 * HTTP/1.1 request block into its `ParsedHttpRequest` shape as `json` — matches the tool's own
 * "paste" mode (with the default `https` assumed scheme). Until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select "build" mode or the cURL/raw
 * HTTP/other-language export.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'HTTP Request Builder expects text input.', kind: 'invalid-input' } };
    }

    const result = parseHttpRequestText(input.value, 'https');
    if (result.error !== null) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: result.request } };
  },
};
