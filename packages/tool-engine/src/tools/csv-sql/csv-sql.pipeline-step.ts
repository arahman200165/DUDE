import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertCsvSql } from "./csv-sql-transform.js";

/**
 * Pipeline-step adapter for the CSV <-> SQL Converter tool. Always converts CSV -> SQL INSERT
 * statements (the tool's own default direction) with the tool's own default table name `table` —
 * a small config value, not a second document. `convertCsvSql` only ever consumes and produces a
 * plain string regardless of direction, so `accepts`/`produces` are narrowed to `text` here
 * rather than the declared registry `io`'s `['text', 'table', 'json']` / `['text', 'table']`,
 * which cover the tool's other two directions (`sql-to-csv`, `json-to-sql`) and its table preview.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CSV ↔ SQL Converter expects text input.', kind: 'invalid-input' } };
    }

    const result = convertCsvSql(input.value, 'csv-to-sql', 'table');
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: result.output } };
  },
};
