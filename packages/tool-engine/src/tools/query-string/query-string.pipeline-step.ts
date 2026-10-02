import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { QueryPair, buildQueryString, parseQueryString } from "./query-string-codec.js";

/**
 * Pipeline-step adapter for the Query String Parser / Builder tool.
 *
 * Drift from the declared `io` in tool-definitions.ts: it lists `produces: ['json', 'url', 'text']`,
 * but the underlying pure functions (`parseQueryString`/`buildQueryString`) only ever produce an
 * array of key/value pairs (`json`) or a bare query string (`text`) — nothing is ever wrapped as a
 * `url` value, so this adapter honestly produces only `['json', 'text']`.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'url', 'json'],
  produces: ['json', 'text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type === 'text' || input.type === 'url') {
      const pairs = parseQueryString(input.value);
      return { ok: true, output: { type: 'json', value: pairs } };
    }

    if (input.type === 'json') {
      if (!isPairArray(input.value)) {
        return {
          ok: false,
          error: { message: 'Query String Parser / Builder expects an array of {key, value} pairs as JSON input.', kind: 'invalid-input' },
        };
      }
      return { ok: true, output: { type: 'text', value: buildQueryString(input.value) } };
    }

    return {
      ok: false,
      error: { message: 'Query String Parser / Builder expects text, url, or json input.', kind: 'invalid-input' },
    };
  },
};

function isPairArray(value: unknown): value is readonly QueryPair[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'object' && item !== null && typeof (item as QueryPair).key === 'string' && typeof (item as QueryPair).value === 'string')
  );
}
