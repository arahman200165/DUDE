/** Pure, framework-free SQL formatting/minifying, built on the `sql-formatter` library. */
import { format } from 'sql-formatter';

export type SqlDialect = 'sql' | 'postgresql' | 'mysql' | 'mariadb' | 'sqlite' | 'transactsql' | 'plsql';

export const SQL_DIALECTS: readonly { readonly id: SqlDialect; readonly label: string }[] = [
  { id: 'sql', label: 'Standard SQL' },
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'mariadb', label: 'MariaDB' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'transactsql', label: 'SQL Server (T-SQL)' },
  { id: 'plsql', label: 'Oracle (PL/SQL)' },
];

export type SqlFormatMode = 'format' | 'minify';

export type SqlFormatResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

/** Collapses runs of whitespace to a single space, without touching whitespace inside '...'/"..." string literals. */
function collapseWhitespaceOutsideStrings(sql: string): string {
  let result = '';
  let inSingle = false;
  let inDouble = false;
  let lastWasSpace = false;

  for (const char of sql) {
    if (!inDouble && char === "'") {
      inSingle = !inSingle;
      result += char;
      lastWasSpace = false;
      continue;
    }
    if (!inSingle && char === '"') {
      inDouble = !inDouble;
      result += char;
      lastWasSpace = false;
      continue;
    }
    if (!inSingle && !inDouble && /\s/.test(char)) {
      if (!lastWasSpace) {
        result += ' ';
        lastWasSpace = true;
      }
      continue;
    }
    result += char;
    lastWasSpace = false;
  }

  return result.trim();
}

export function formatSql(sql: string, dialect: SqlDialect, mode: SqlFormatMode): SqlFormatResult {
  if (sql.trim() === '') return { ok: false, error: 'Enter some SQL.' };

  if (mode === 'minify') {
    return { ok: true, output: collapseWhitespaceOutsideStrings(sql) };
  }

  try {
    return { ok: true, output: format(sql, { language: dialect }) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to format SQL.' };
  }
}
