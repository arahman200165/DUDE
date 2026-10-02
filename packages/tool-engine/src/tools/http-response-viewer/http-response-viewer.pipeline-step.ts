import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseHttpResponseText } from "./http-response-parse.js";

/**
 * Pipeline-step adapter for the HTTP Response Viewer tool — the first tool to produce the
 * `http-response` pipeline value: `{status, statusText, headers, body}`, with `body` itself
 * pretty-printed as `json` when the body parses as JSON, or kept as `text` otherwise.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['http-response'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'HTTP Response Viewer expects text input.', kind: 'invalid-input' } };
    }

    const result = parseHttpResponseText(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    const body: PipelineValue = result.bodyIsJson
      ? { type: 'json', value: JSON.parse(result.bodyRaw) }
      : { type: 'text', value: result.bodyRaw };

    return {
      ok: true,
      output: {
        type: 'http-response',
        value: {
          status: result.statusCode,
          statusText: result.statusText,
          headers: result.headers,
          body,
        },
      },
    };
  },
};
