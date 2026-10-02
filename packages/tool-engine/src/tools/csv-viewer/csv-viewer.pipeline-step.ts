import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseCsv } from "./csv-convert.js";

/**
 * Pipeline-step adapter for the CSV Viewer / Converter tool. Always parses CSV text with a
 * comma delimiter and a header row — matches the tool's own defaults — into a `table` value.
 * Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select a
 * different delimiter, header-row setting, or the reverse `json-to-csv` direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CSV Viewer expects text input.', kind: 'invalid-input' } };
    }

    const result = parseCsv(input.value, ',', true);
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'table', value: result.table } };
  },
};
