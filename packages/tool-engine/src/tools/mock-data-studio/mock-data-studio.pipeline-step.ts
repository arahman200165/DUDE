import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateMockData, parseSchema, type MockDataRow } from "./mock-data-schema.js";

/**
 * Pipeline-step adapter for the Mock Data Studio tool. The flowing JSON value is
 * the schema itself (`{ field: "faker.path" }`), re-stringified and run back
 * through `parseSchema` for its validation — mirroring how the JSON Formatter
 * adapter normalizes a `json` input by round-tripping it through its own
 * text-based parser. Always generates 5 rows — until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step has no slot for row count or
 * seed. Emits a `table` value (the shape `generateMockData` naturally produces);
 * declared `produces` is narrowed from the tool's `table`/`json`/`text`/`file`
 * export formats to just `table`.
 */
function toCellValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

export const pipelineStep: PipelineStep = {
  accepts: ['json'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'json') {
      return { ok: false, error: { message: 'Mock Data Studio expects JSON input.', kind: 'invalid-input' } };
    }

    try {
      const schemaResult = parseSchema(JSON.stringify(input.value));
      if (!schemaResult.ok) {
        return { ok: false, error: { message: schemaResult.error, kind: 'invalid-input' } };
      }

      const genResult = generateMockData(schemaResult.schema, { rowCount: 5 });
      if (!genResult.ok) {
        return { ok: false, error: { message: genResult.error, kind: 'invalid-input' } };
      }

      const rows: readonly MockDataRow[] = genResult.rows;
      const columns = rows.length > 0 ? Object.keys(rows[0]) : Object.keys(schemaResult.schema);
      const tableRows = rows.map((row) => columns.map((column) => toCellValue(row[column])));

      return { ok: true, output: { type: 'table', value: { columns, rows: tableRows } } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to generate mock data.', kind: 'execution-error' } };
    }
  },
};
