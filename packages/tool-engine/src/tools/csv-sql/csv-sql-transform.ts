/**
 * Pure, framework-free CSV <-> SQL INSERT conversion used by the CSV <-> SQL
 * Converter tool. Shared as-is between the main thread (small inputs) and
 * `csv-sql.worker.ts` (large inputs).
 */

import Papa from 'papaparse';

export type CsvSqlDirection = 'csv-to-sql' | 'sql-to-csv' | 'json-to-sql';

export interface CsvSqlError {
  readonly message: string;
}

export type CsvSqlResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: CsvSqlError };

const NUMERIC = /^-?\d+(\.\d+)?$/;

/** Exported for reuse by Mock Data Studio's SQL export and CSV/JSON-to-INSERT conversion. */
export function sqlValue(value: string): string {
  if (value === '') return 'NULL';
  if (NUMERIC.test(value)) return value;
  return `'${value.replace(/'/g, "''")}'`;
}

function csvToSql(input: string, tableName: string): CsvSqlResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some CSV.' } };

  const parsed = Papa.parse<string[]>(input, { delimiter: ',', skipEmptyLines: true });
  if (parsed.errors.length > 0) return { ok: false, error: { message: parsed.errors[0].message } };
  if (parsed.data.length === 0) return { ok: false, error: { message: 'No rows found.' } };

  const [header, ...rows] = parsed.data;
  if (rows.length === 0) return { ok: false, error: { message: 'No data rows found below the header.' } };

  const columnList = header.join(', ');
  const statements = rows.map((row) => {
    const values = header.map((_, index) => sqlValue(row[index] ?? ''));
    return `INSERT INTO ${tableName} (${columnList}) VALUES (${values.join(', ')});`;
  });

  return { ok: true, output: statements.join('\n') };
}

/** Splits a SQL value list on top-level commas, respecting '...'-quoted strings with ''-escaped quotes. */
function splitValues(text: string): string[] {
  const values: string[] = [];
  let current = '';
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === "'" && text[i + 1] === "'") {
        current += "''";
        i++;
      } else if (char === "'") {
        inString = false;
        current += char;
      } else {
        current += char;
      }
    } else if (char === "'") {
      inString = true;
      current += char;
    } else if (char === ',') {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function unquoteSqlValue(value: string): string {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.toUpperCase() === 'NULL') return '';
  return value;
}

/**
 * Finds the index of the ')' matching the '(' at `openIndex`, skipping over '...'-quoted
 * strings (with ''-escaped quotes) so a literal ')' or ';' inside a quoted value -- e.g.
 * `VALUES (NULL, ';')` -- doesn't get mistaken for the statement's own punctuation.
 */
function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  for (let i = openIndex; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === "'" && text[i + 1] === "'") {
        i++;
      } else if (char === "'") {
        inString = false;
      }
      continue;
    }
    if (char === "'") inString = true;
    else if (char === '(') depth++;
    else if (char === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const INSERT_HEAD_RE = /INSERT\s+INTO\s+\S+\s*\(([^)]*)\)\s*VALUES\s*\(/gis;

function sqlToCsv(input: string): CsvSqlResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some SQL INSERT statements.' } };

  const statements: { columns: string; valuesText: string }[] = [];
  INSERT_HEAD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INSERT_HEAD_RE.exec(input)) !== null) {
    const openParenIndex = match.index + match[0].length - 1;
    const closeParenIndex = findMatchingParen(input, openParenIndex);
    if (closeParenIndex === -1) continue;

    statements.push({ columns: match[1], valuesText: input.slice(openParenIndex + 1, closeParenIndex) });
    INSERT_HEAD_RE.lastIndex = closeParenIndex + 1;
  }

  if (statements.length === 0) {
    return { ok: false, error: { message: 'No INSERT INTO ... VALUES (...) statements found.' } };
  }

  const columns = statements[0].columns.split(',').map((column) => column.trim());
  const rows = statements.map((statement) => splitValues(statement.valuesText).map(unquoteSqlValue));

  const output = Papa.unparse([columns, ...rows], { newline: '\n' });
  return { ok: true, output };
}

function jsonValueToSql(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  return sqlValue(String(value));
}

function jsonToSql(input: string, tableName: string): CsvSqlResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter a JSON array of objects.' } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return { ok: false, error: { message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` } };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, error: { message: 'JSON input must be a non-empty array of objects.' } };
  }
  if (!parsed.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))) {
    return { ok: false, error: { message: 'Every array element must be a flat JSON object.' } };
  }

  const rows = parsed as Record<string, unknown>[];
  const columns = Object.keys(rows[0]);
  const columnList = columns.join(', ');

  const statements = rows.map((row) => {
    const values = columns.map((column) => jsonValueToSql(row[column]));
    return `INSERT INTO ${tableName} (${columnList}) VALUES (${values.join(', ')});`;
  });

  return { ok: true, output: statements.join('\n') };
}

export function convertCsvSql(input: string, direction: CsvSqlDirection, tableName: string): CsvSqlResult {
  if (direction === 'csv-to-sql') return csvToSql(input, tableName || 'table');
  if (direction === 'json-to-sql') return jsonToSql(input, tableName || 'table');
  return sqlToCsv(input);
}
