/**
 * Pure, framework-free SQL dialect conversion: parses SQL under a source dialect
 * to an AST via `node-sql-parser`, then regenerates it under a target dialect.
 * Best-effort — mainly identifier-quoting and clause-syntax differences the
 * library itself understands, not a full semantic translation of every dialect
 * quirk (e.g. MySQL's LIMIT isn't rewritten to SQL Server's TOP). The caller passes the
 * parser loaded for the `from` dialect (`loadSqlParser`); it also regenerates any target.
 */
import type { SqlDialect, SqlParser } from '../../shared/sql/sql-parser.js';

export type SqlConverterDialect = SqlDialect;

export const SQL_CONVERTER_DIALECTS: readonly { readonly id: SqlConverterDialect; readonly label: string }[] = [
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'mariadb', label: 'MariaDB' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'transactsql', label: 'SQL Server (T-SQL)' },
];

export type SqlDialectConvertResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

export function convertSqlDialect(parser: SqlParser, sql: string, from: SqlConverterDialect, to: SqlConverterDialect): SqlDialectConvertResult {
  if (sql.trim() === '') return { ok: false, error: 'Enter some SQL.' };

  try {
    const ast = parser.astify(sql, { database: from });
    return { ok: true, output: parser.sqlify(ast, { database: to }) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to convert SQL.' };
  }
}
