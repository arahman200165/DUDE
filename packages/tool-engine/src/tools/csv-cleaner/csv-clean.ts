/**
 * Pure, framework-free CSV cleaning used by the CSV Cleaner tool. Shared
 * as-is between the main thread (small inputs) and `csv-clean.worker.ts`
 * (large inputs).
 */

import Papa from 'papaparse';

export interface CsvCleanOptions {
  readonly trimCells: boolean;
  readonly dropEmptyRows: boolean;
}

export interface CsvCleanError {
  readonly message: string;
}

export type CsvCleanResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: CsvCleanError };

export function cleanCsv(input: string, options: CsvCleanOptions): CsvCleanResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some CSV.' } };

  const parsed = Papa.parse<string[]>(input, { delimiter: ',', skipEmptyLines: false });
  if (parsed.errors.length > 0) return { ok: false, error: { message: parsed.errors[0].message } };

  let rows = parsed.data;
  if (options.trimCells) {
    rows = rows.map((row) => row.map((cell) => cell.trim()));
  }
  if (options.dropEmptyRows) {
    rows = rows.filter((row) => row.some((cell) => cell.trim() !== ''));
  }

  if (rows.length === 0) return { ok: false, error: { message: 'No rows remain after cleaning.' } };

  return { ok: true, output: Papa.unparse(rows, { newline: '\n' }) };
}
