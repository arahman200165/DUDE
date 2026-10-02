import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { filterSortCsv } from "./csv-filter-sort-transform.js";

/**
 * Pipeline-step adapter for the CSV Filter / Sort tool. Uses the tool's own default config — no
 * filter column and no sort column, both of which `filterSortCsv` treats as "skip this step" — so
 * this passes the CSV through as a parsed `table` unchanged. A universally sensible default,
 * unlike `csv-pivot`'s column config, since an empty filter/sort column is a genuine no-op rather
 * than a required-field error.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CSV Filter / Sort expects text input.', kind: 'invalid-input' } };
    }

    const result = filterSortCsv(input.value, '', 'contains', '', '', 'asc');
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'table', value: result.table } };
  },
};
