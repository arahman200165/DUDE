import { parseCsv, type CsvDelimiter } from '@dude/tool-engine/tools/csv-viewer/csv-convert';
import { defineOffThreadTask } from '../../kit/off-thread';

export interface CsvTaskPayload { readonly input: string; readonly delimiter: CsvDelimiter; readonly hasHeaderRow: boolean; readonly maxRows: number }
export type CsvTaskResult =
  | { readonly ok: true; readonly columns: string[]; readonly rows: string[][]; readonly totalRows: number; readonly json: string }
  | { readonly ok: false; readonly error: string };

/**
 * Parses once with the engine's `parseCsv` (papaparse) on the worker and derives the same JSON as the engine's `csvToJson`
 * from the parsed table, so the slow parse is not paid twice. Only the first `maxRows` rows cross back for display.
 */
export const csvParseTask = defineOffThreadTask((payload: CsvTaskPayload): CsvTaskResult => {
  'worklet';
  const parsed = parseCsv(payload.input, payload.delimiter, payload.hasHeaderRow);
  if (!parsed.ok) return { ok: false, error: parsed.error.message };
  const { columns, rows } = parsed.table;
  const json = payload.hasHeaderRow
    ? JSON.stringify(rows.map(row => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? '']))), null, 2)
    : JSON.stringify(rows, null, 2);
  return { ok: true, columns: [...columns], rows: rows.slice(0, payload.maxRows).map(row => [...row]), totalRows: rows.length, json };
});
