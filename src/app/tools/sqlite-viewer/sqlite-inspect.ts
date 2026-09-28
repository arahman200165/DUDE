/**
 * SQLite file inspection used by the SQLite File Viewer tool, via `sql.js`
 * (SQLite compiled to WebAssembly). Not fully framework-free — it reads
 * `document.baseURI` to locate the WASM asset copied alongside the build
 * output (`angular.json`'s `assets` entry, `assets/vendor/sql.js/`), the
 * same pattern the Python Playground uses for Pyodide.
 *
 * Read-only, uploaded-file inspection only — a *live* database connection
 * is covered separately by the Database Toolkit (PRD Phase 33).
 */

import initSqlJs, { type SqlJsStatic, type SqlValue } from 'sql.js';

export interface SqliteTable {
  readonly name: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface SqliteInspectError {
  readonly message: string;
}

export type SqliteInspectResult =
  | { readonly ok: true; readonly tables: readonly SqliteTable[] }
  | { readonly ok: false; readonly error: SqliteInspectError };

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    const wasmDir = new URL('assets/vendor/sql.js/', document.baseURI).href;
    sqlJsPromise = initSqlJs({ locateFile: (file) => `${wasmDir}${file}` });
  }
  return sqlJsPromise;
}

function cellToString(value: SqlValue): string {
  if (value === null) return '';
  if (value instanceof Uint8Array) return `<${value.byteLength} bytes>`;
  return String(value);
}

export async function inspectSqlite(bytes: Uint8Array): Promise<SqliteInspectResult> {
  if (bytes.byteLength === 0) return { ok: false, error: { message: 'The file is empty.' } };

  try {
    const SQL = await loadSqlJs();
    const db = new SQL.Database(bytes);
    try {
      const namesResult = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
      const tableNames = (namesResult[0]?.values ?? []).map((row) => String(row[0]));

      const tables: SqliteTable[] = tableNames.map((name) => {
        const result = db.exec(`SELECT * FROM "${name.replace(/"/g, '""')}"`);
        const columns = result[0]?.columns ?? [];
        const rows = (result[0]?.values ?? []).map((row) => row.map(cellToString));
        return { name, columns, rows };
      });

      return { ok: true, tables };
    } finally {
      db.close();
    }
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
