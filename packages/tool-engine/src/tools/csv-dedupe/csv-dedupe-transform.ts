/**
 * Pure, framework-free CSV deduplication used by the CSV Deduplicator tool.
 * Shared as-is between the main thread (small inputs) and
 * `csv-dedupe.worker.ts` (large inputs).
 */

import Papa from 'papaparse';

export interface CsvDedupeError {
  readonly message: string;
}

export type CsvDedupeResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: CsvDedupeError };

export function dedupeCsv(input: string, keyColumnsInput: string): CsvDedupeResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some CSV.' } };

  const parsed = Papa.parse<Record<string, string>>(input, { header: true, skipEmptyLines: true });
  // A single-column CSV has no delimiter to detect; Papa still parses it correctly and just warns.
  const fatalErrors = parsed.errors.filter((error) => error.code !== 'UndetectableDelimiter');
  if (fatalErrors.length > 0) return { ok: false, error: { message: fatalErrors[0].message } };

  const fields = parsed.meta.fields ?? [];
  if (fields.length === 0) return { ok: false, error: { message: 'No header row found.' } };

  const keyColumns = keyColumnsInput
    .split(',')
    .map((column) => column.trim())
    .filter((column) => column !== '');

  for (const column of keyColumns) {
    if (!fields.includes(column)) return { ok: false, error: { message: `Column "${column}" was not found in the header.` } };
  }

  const effectiveKeyColumns = keyColumns.length > 0 ? keyColumns : fields;
  const seen = new Set<string>();
  const rows: Record<string, string>[] = [];

  for (const row of parsed.data) {
    const key = JSON.stringify(effectiveKeyColumns.map((column) => row[column] ?? ''));
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  return { ok: true, output: Papa.unparse(rows, { columns: fields, newline: '\n' }) };
}
