import Papa from 'papaparse';
import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { pivotCsv } from "./csv-pivot-transform.js";

/**
 * Pipeline-step adapter for the CSV Pivot tool. Unlike `csv-dedupe`/`csv-filter-sort`, this
 * tool's own defaults for its column config are empty strings, which `pivotCsv` explicitly
 * rejects as required fields — there's no built-in default to just reuse. Instead, this adapter
 * peeks at the CSV header to pick a genuinely usable default: the first column as the row key,
 * the second column (or the first, if there's only one) as the column key, and the last column as
 * the value column, aggregated by `count` (which — unlike `sum`/`avg` — produces a sensible result
 * regardless of whether the value column holds numbers).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CSV Pivot expects text input.', kind: 'invalid-input' } };
    }

    const peek = Papa.parse<Record<string, string>>(input.value, { header: true, skipEmptyLines: true, preview: 1 });
    const fields = peek.meta.fields ?? [];
    if (fields.length === 0) {
      return { ok: false, error: { message: 'CSV Pivot could not find a header row to pick pivot columns from.', kind: 'invalid-input' } };
    }

    const rowKeyColumn = fields[0];
    const columnKeyColumn = fields.length > 1 ? fields[1] : fields[0];
    const valueColumn = fields[fields.length - 1];

    const result = pivotCsv(input.value, rowKeyColumn, columnKeyColumn, valueColumn, 'count');
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'table', value: result.table } };
  },
};
