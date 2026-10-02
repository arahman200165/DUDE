/**
 * Pure, framework-free Parquet decoding used by the Parquet Viewer tool, via
 * `hyparquet` (pure JS, no WASM, no Node built-ins — verified to bundle
 * cleanly for the browser, unlike `avsc`). Async because reading a Parquet
 * file's footer/row-groups is inherently async in hyparquet's API, even
 * though the whole file is already in memory here.
 */

import { parquetReadObjects, type AsyncBuffer } from 'hyparquet';

export interface ParquetDecodeError {
  readonly message: string;
}

export interface ParquetTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export type ParquetDecodeResult =
  | { readonly ok: true; readonly table: ParquetTable }
  | { readonly ok: false; readonly error: ParquetDecodeError };

function toAsyncBuffer(bytes: Uint8Array): AsyncBuffer {
  return {
    byteLength: bytes.byteLength,
    slice: (start: number, end?: number) => bytes.slice(start, end).buffer as ArrayBuffer,
  };
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Uint8Array) return `<${value.byteLength} bytes>`;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export async function decodeParquet(bytes: Uint8Array): Promise<ParquetDecodeResult> {
  if (bytes.byteLength === 0) return { ok: false, error: { message: 'The file is empty.' } };

  try {
    const rows = (await parquetReadObjects({ file: toAsyncBuffer(bytes), rowFormat: 'object' })) as readonly Record<
      string,
      unknown
    >[];

    const columns: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!columns.includes(key)) columns.push(key);
      }
    }

    const tableRows = rows.map((row) => columns.map((column) => cellToString(row[column])));
    return { ok: true, table: { columns, rows: tableRows } };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
