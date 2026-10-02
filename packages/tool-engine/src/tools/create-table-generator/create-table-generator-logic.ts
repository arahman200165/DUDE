/**
 * Pure, framework-free CREATE TABLE DDL generation from a sampled JSON array
 * or CSV: infers a per-column type by sampling every row's values, then emits
 * dialect-specific DDL (identifier quoting + type mapping differ per dialect).
 */
import Papa from 'papaparse';

export type ColumnKind = 'integer' | 'number' | 'boolean' | 'date' | 'string';

export interface InferredColumn {
  readonly name: string;
  readonly kind: ColumnKind;
  readonly nullable: boolean;
}

export type CreateTableDialect = 'postgresql' | 'mysql' | 'mariadb' | 'sqlite' | 'transactsql';

export const CREATE_TABLE_DIALECTS: readonly { readonly id: CreateTableDialect; readonly label: string }[] = [
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'mariadb', label: 'MariaDB' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'transactsql', label: 'SQL Server (T-SQL)' },
];

const TYPE_MAP: Record<CreateTableDialect, Record<ColumnKind, string>> = {
  postgresql: { integer: 'INTEGER', number: 'DOUBLE PRECISION', boolean: 'BOOLEAN', date: 'TIMESTAMP', string: 'VARCHAR(255)' },
  mysql: { integer: 'INT', number: 'DOUBLE', boolean: 'TINYINT(1)', date: 'DATETIME', string: 'VARCHAR(255)' },
  mariadb: { integer: 'INT', number: 'DOUBLE', boolean: 'TINYINT(1)', date: 'DATETIME', string: 'VARCHAR(255)' },
  sqlite: { integer: 'INTEGER', number: 'REAL', boolean: 'INTEGER', date: 'TEXT', string: 'TEXT' },
  transactsql: { integer: 'INT', number: 'FLOAT', boolean: 'BIT', date: 'DATETIME2', string: 'NVARCHAR(255)' },
};

function quoteIdentifier(dialect: CreateTableDialect, name: string): string {
  if (dialect === 'mysql' || dialect === 'mariadb') return `\`${name}\``;
  if (dialect === 'transactsql') return `[${name}]`;
  return `"${name}"`;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function inferKind(values: readonly unknown[]): ColumnKind {
  const present = values.filter((value) => !isBlank(value));
  if (present.length === 0) return 'string';

  if (present.every((value) => typeof value === 'boolean' || value === 'true' || value === 'false')) return 'boolean';
  if (present.every((value) => (typeof value === 'number' && Number.isInteger(value)) || /^-?\d+$/.test(String(value)))) return 'integer';
  if (present.every((value) => typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value)))) return 'number';
  if (present.every((value) => /^\d{4}-\d{2}-\d{2}/.test(String(value)) && !Number.isNaN(Date.parse(String(value))))) return 'date';
  return 'string';
}

function inferColumns(rows: readonly Record<string, unknown>[]): readonly InferredColumn[] {
  const names = Object.keys(rows[0] ?? {});
  return names.map((name) => {
    const values = rows.map((row) => row[name]);
    return { name, kind: inferKind(values), nullable: values.some(isBlank) };
  });
}

type ParseSampleResult = { readonly ok: true; readonly rows: readonly Record<string, unknown>[] } | { readonly ok: false; readonly error: string };

function parseSample(text: string): ParseSampleResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a JSON array or CSV sample.' };

  if (trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      return { ok: false, error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { ok: false, error: 'JSON input must be a non-empty array of objects.' };
    }
    if (!parsed.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))) {
      return { ok: false, error: 'Every array element must be a flat JSON object.' };
    }
    return { ok: true, rows: parsed as Record<string, unknown>[] };
  }

  const parsed = Papa.parse<Record<string, string>>(trimmed, { header: true, skipEmptyLines: true });
  // A single-column sample makes Papa Parse unable to auto-detect a delimiter — it still parses
  // correctly (defaulting to ','), so that specific advisory is not a fatal error.
  const fatalErrors = parsed.errors.filter((error) => error.code !== 'UndetectableDelimiter');
  if (fatalErrors.length > 0) return { ok: false, error: fatalErrors[0].message };
  if (parsed.data.length === 0) return { ok: false, error: 'No data rows found.' };
  return { ok: true, rows: parsed.data };
}

export type CreateTableResult = { readonly ok: true; readonly sql: string } | { readonly ok: false; readonly error: string };

export function generateCreateTable(sample: string, tableName: string, dialect: CreateTableDialect): CreateTableResult {
  const parsed = parseSample(sample);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const columns = inferColumns(parsed.rows);
  const lines = columns.map((column) => {
    const sqlType = TYPE_MAP[dialect][column.kind];
    return `  ${quoteIdentifier(dialect, column.name)} ${sqlType}${column.nullable ? '' : ' NOT NULL'}`;
  });

  const table = quoteIdentifier(dialect, tableName.trim() || 'my_table');
  return { ok: true, sql: `CREATE TABLE ${table} (\n${lines.join(',\n')}\n);` };
}
