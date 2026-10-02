/**
 * Pure, framework-free CSV join used by the CSV Join / Merge tool. Shared
 * as-is between the main thread (small inputs) and `csv-join.worker.ts`
 * (large inputs).
 */

import Papa from 'papaparse';

export type CsvJoinType = 'inner' | 'left';

export interface CsvJoinError {
  readonly message: string;
}

export interface CsvJoinTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export type CsvJoinResult = { readonly ok: true; readonly table: CsvJoinTable } | { readonly ok: false; readonly error: CsvJoinError };

export function joinCsv(
  leftInput: string,
  rightInput: string,
  leftKey: string,
  rightKey: string,
  joinType: CsvJoinType,
): CsvJoinResult {
  if (leftInput.trim() === '') return { ok: false, error: { message: 'Enter the left CSV.' } };
  if (rightInput.trim() === '') return { ok: false, error: { message: 'Enter the right CSV.' } };
  if (leftKey.trim() === '') return { ok: false, error: { message: 'Enter the left key column.' } };
  if (rightKey.trim() === '') return { ok: false, error: { message: 'Enter the right key column.' } };

  // A single-column CSV has no delimiter to detect; Papa still parses it correctly and just warns.
  const left = Papa.parse<Record<string, string>>(leftInput, { header: true, skipEmptyLines: true });
  const leftFatalErrors = left.errors.filter((error) => error.code !== 'UndetectableDelimiter');
  if (leftFatalErrors.length > 0) return { ok: false, error: { message: leftFatalErrors[0].message } };

  const right = Papa.parse<Record<string, string>>(rightInput, { header: true, skipEmptyLines: true });
  const rightFatalErrors = right.errors.filter((error) => error.code !== 'UndetectableDelimiter');
  if (rightFatalErrors.length > 0) return { ok: false, error: { message: rightFatalErrors[0].message } };

  const leftFields = left.meta.fields ?? [];
  const rightFields = right.meta.fields ?? [];
  if (!leftFields.includes(leftKey)) return { ok: false, error: { message: `Column "${leftKey}" was not found in the left CSV header.` } };
  if (!rightFields.includes(rightKey)) {
    return { ok: false, error: { message: `Column "${rightKey}" was not found in the right CSV header.` } };
  }

  const rightByKey = new Map<string, Record<string, string>>();
  for (const row of right.data) {
    const key = row[rightKey] ?? '';
    if (!rightByKey.has(key)) rightByKey.set(key, row);
  }

  const rightOutputFields = rightFields.filter((field) => field !== rightKey);
  const columns = [...leftFields, ...rightOutputFields.map((field) => (leftFields.includes(field) ? `right_${field}` : field))];

  const rows: string[][] = [];
  for (const leftRow of left.data) {
    const matched = rightByKey.get(leftRow[leftKey] ?? '');
    if (!matched && joinType === 'inner') continue;

    const leftValues = leftFields.map((field) => leftRow[field] ?? '');
    const rightValues = rightOutputFields.map((field) => matched?.[field] ?? '');
    rows.push([...leftValues, ...rightValues]);
  }

  return { ok: true, table: { columns, rows } };
}
