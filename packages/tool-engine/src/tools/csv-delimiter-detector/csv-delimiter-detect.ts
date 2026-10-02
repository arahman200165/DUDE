/**
 * Pure, framework-free CSV delimiter detection used by the CSV Delimiter
 * Detector tool. Shared as-is between the main thread (small inputs) and
 * `csv-delimiter-detect.worker.ts` (large inputs).
 */

import Papa from 'papaparse';

export interface CsvDelimiterTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface CsvDelimiterError {
  readonly message: string;
}

export type CsvDelimiterResult =
  | { readonly ok: true; readonly delimiter: string; readonly label: string; readonly table: CsvDelimiterTable }
  | { readonly ok: false; readonly error: CsvDelimiterError };

const CANDIDATES: readonly { readonly delimiter: string; readonly label: string }[] = [
  { delimiter: ',', label: 'Comma ( , )' },
  { delimiter: ';', label: 'Semicolon ( ; )' },
  { delimiter: '\t', label: 'Tab' },
  { delimiter: '|', label: 'Pipe ( | )' },
];

function scoreDelimiter(lines: readonly string[], delimiter: string): { readonly consistent: boolean; readonly fieldCount: number } {
  const counts = lines.map((line) => line.split(delimiter).length);
  const consistent = counts.every((count) => count === counts[0]);
  return { consistent, fieldCount: counts[0] ?? 1 };
}

export function detectCsvDelimiter(input: string): CsvDelimiterResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some CSV/TSV/PSV.' } };

  const lines = input.split(/\r\n|\r|\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { ok: false, error: { message: 'Enter some CSV/TSV/PSV.' } };

  let best = CANDIDATES[0];
  let bestScore = scoreDelimiter(lines, best.delimiter);

  for (const candidate of CANDIDATES.slice(1)) {
    const score = scoreDelimiter(lines, candidate.delimiter);
    const better =
      (score.consistent && !bestScore.consistent) ||
      (score.consistent === bestScore.consistent && score.fieldCount > bestScore.fieldCount);
    if (better) {
      best = candidate;
      bestScore = score;
    }
  }

  const parsed = Papa.parse<string[]>(input, { delimiter: best.delimiter, skipEmptyLines: true });
  if (parsed.errors.length > 0) return { ok: false, error: { message: parsed.errors[0].message } };
  if (parsed.data.length === 0) return { ok: false, error: { message: 'No rows found.' } };

  const [header, ...rows] = parsed.data;
  return { ok: true, delimiter: best.delimiter, label: best.label, table: { columns: header, rows } };
}
