/**
 * Pure, framework-free CSV column-statistics computation used by the CSV
 * Column Statistics tool. Shared as-is between the main thread (small
 * inputs) and `csv-stats-compute.worker.ts` (large inputs).
 */

import Papa from 'papaparse';

export interface CsvStatsTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface CsvStatsError {
  readonly message: string;
}

export type CsvStatsResult = { readonly ok: true; readonly table: CsvStatsTable } | { readonly ok: false; readonly error: CsvStatsError };

const COLUMNS = ['Column', 'Count', 'Empty', 'Distinct', 'Min', 'Max', 'Mean'] as const;

export function computeCsvStats(input: string): CsvStatsResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some CSV.' } };

  const parsed = Papa.parse<Record<string, string>>(input, { delimiter: ',', header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) return { ok: false, error: { message: parsed.errors[0].message } };

  const fields = parsed.meta.fields ?? [];
  if (fields.length === 0) return { ok: false, error: { message: 'No header row found.' } };
  if (parsed.data.length === 0) return { ok: false, error: { message: 'No data rows found below the header.' } };

  const rows = fields.map((field) => {
    const values = parsed.data.map((row) => (row[field] ?? '').trim());
    const nonEmpty = values.filter((value) => value !== '');
    const empty = values.length - nonEmpty.length;
    const distinct = new Set(nonEmpty).size;

    const isNumeric = nonEmpty.length > 0 && nonEmpty.every((value) => Number.isFinite(Number(value)));
    let min = '';
    let max = '';
    let mean = '';
    if (isNumeric) {
      const numbers = nonEmpty.map(Number);
      min = String(Math.min(...numbers));
      max = String(Math.max(...numbers));
      mean = (numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(2);
    }

    return [field, String(values.length), String(empty), String(distinct), min, max, mean];
  });

  return { ok: true, table: { columns: COLUMNS, rows } };
}
