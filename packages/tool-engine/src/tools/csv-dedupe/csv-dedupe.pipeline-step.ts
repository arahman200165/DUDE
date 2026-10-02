import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { dedupeCsv } from "./csv-dedupe-transform.js";

/**
 * Pipeline-step adapter for the CSV Deduplicator tool. Uses the tool's own default key-columns
 * value (an empty string, meaning "dedupe by every column") — a universally sensible default,
 * unlike `csv-pivot`'s column config. `dedupeCsv` only ever consumes/produces a plain CSV string,
 * so `accepts`/`produces` are narrowed to `text` here rather than the declared registry `io`'s
 * `['text', 'table']`.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CSV Deduplicator expects text input.', kind: 'invalid-input' } };
    }

    const result = dedupeCsv(input.value, '');
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: result.output } };
  },
};
