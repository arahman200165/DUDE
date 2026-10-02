/**
 * Pure, framework-free CSV <-> JSON conversion and parsing used by the CSV
 * Viewer / Converter tool. Shared as-is between the main thread (small
 * inputs) and `csv-convert.worker.ts` (large inputs).
 */

import Papa from 'papaparse';

export type CsvDelimiter = ',' | ';' | '\t';
export type CsvDirection = 'csv-to-json' | 'json-to-csv';

export interface CsvConvertError {
  readonly message: string;
}

export interface CsvTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export type CsvParseResult = { readonly ok: true; readonly table: CsvTable } | { readonly ok: false; readonly error: CsvConvertError };
export type CsvConvertResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: CsvConvertError };

export function parseCsv(input: string, delimiter: CsvDelimiter, hasHeaderRow: boolean): CsvParseResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some CSV.' } };

  const result = Papa.parse<string[]>(input, { delimiter, skipEmptyLines: true });
  if (result.errors.length > 0) return { ok: false, error: { message: result.errors[0].message } };
  if (result.data.length === 0) return { ok: false, error: { message: 'No rows found.' } };

  const [firstRow, ...rest] = result.data;
  const columns = hasHeaderRow ? firstRow : firstRow.map((_, index) => `Column ${index + 1}`);
  const rows = hasHeaderRow ? rest : result.data;

  return { ok: true, table: { columns, rows } };
}

export function csvToJson(input: string, delimiter: CsvDelimiter, hasHeaderRow: boolean): CsvConvertResult {
  const parsed = parseCsv(input, delimiter, hasHeaderRow);
  if (!parsed.ok) return parsed;

  const { columns, rows } = parsed.table;
  if (!hasHeaderRow) return { ok: true, output: JSON.stringify(rows, null, 2) };

  const objects = rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ''])));
  return { ok: true, output: JSON.stringify(objects, null, 2) };
}

export function jsonToCsv(input: string, delimiter: CsvDelimiter): CsvConvertResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some JSON.' } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }

  if (!Array.isArray(parsed)) return { ok: false, error: { message: 'JSON must be an array of objects or an array of arrays.' } };

  try {
    return { ok: true, output: Papa.unparse(parsed, { delimiter, newline: '\n' }) };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

export function convertCsv(
  input: string,
  direction: CsvDirection,
  delimiter: CsvDelimiter,
  hasHeaderRow: boolean,
): CsvConvertResult {
  return direction === 'csv-to-json' ? csvToJson(input, delimiter, hasHeaderRow) : jsonToCsv(input, delimiter);
}
