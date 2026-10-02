import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { cleanCsv } from "./csv-clean.js";

/**
 * Pipeline-step adapter for the CSV Cleaner tool. Always trims cells and drops empty rows — the
 * tool's own defaults. `cleanCsv` only ever consumes/produces a plain CSV string, so
 * `accepts`/`produces` are narrowed to `text` here rather than the declared registry `io`'s
 * `['text', 'table']`.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CSV Cleaner expects text input.', kind: 'invalid-input' } };
    }

    const result = cleanCsv(input.value, { trimCells: true, dropEmptyRows: true });
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: result.output } };
  },
};
