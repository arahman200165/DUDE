/**
 * Pure, framework-free JSON Lines (NDJSON) parsing used by the JSON Lines /
 * NDJSON Viewer tool. Shared as-is between the main thread (small inputs)
 * and `jsonl-viewer.worker.ts` (large inputs).
 */

export interface JsonlError {
  readonly message: string;
}

export interface JsonlTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface JsonlParseResult {
  readonly records: readonly unknown[];
  readonly arrayOutput: string;
  readonly table: JsonlTable;
}

export type JsonlResult = { readonly ok: true; readonly result: JsonlParseResult } | { readonly ok: false; readonly error: JsonlError };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildTable(records: readonly unknown[]): JsonlTable {
  if (records.length === 0) return { columns: [], rows: [] };

  if (records.every(isPlainObject)) {
    const columns: string[] = [];
    for (const record of records as Record<string, unknown>[]) {
      for (const key of Object.keys(record)) {
        if (!columns.includes(key)) columns.push(key);
      }
    }
    const rows = (records as Record<string, unknown>[]).map((record) =>
      columns.map((column) => (column in record ? JSON.stringify(record[column]) : '')),
    );
    return { columns, rows };
  }

  return { columns: ['value'], rows: records.map((record) => [JSON.stringify(record)]) };
}

export function parseJsonl(input: string): JsonlResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some JSON Lines (NDJSON) input.' } };

  const lines = input.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const records: unknown[] = [];

  for (const [index, line] of lines.entries()) {
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, error: { message: `Line ${index + 1} is invalid JSON: ${detail}` } };
    }
  }

  const table = buildTable(records);
  return { ok: true, result: { records, arrayOutput: JSON.stringify(records, null, 2), table } };
}
