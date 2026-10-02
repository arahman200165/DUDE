import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseJsonl } from "./jsonl-viewer-transform.js";

/**
 * Pipeline-step adapter for the JSON Lines / NDJSON Viewer tool. `parseJsonl` only accepts a raw
 * newline-delimited-JSON string, not an already-parsed JSON value, so `accepts` is narrowed to
 * `text` here (the declared registry `io` also lists `json`, which doesn't apply to this
 * line-oriented format). Produces a `table` value — the tool's own default view mode.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'JSON Lines / NDJSON Viewer expects text input.', kind: 'invalid-input' } };
    }

    const result = parseJsonl(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'table', value: result.result.table } };
  },
};
