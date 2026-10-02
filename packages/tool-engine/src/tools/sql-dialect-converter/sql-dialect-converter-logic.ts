/**
 * Pure, framework-free SQL dialect conversion: parses SQL under a source dialect
 * to an AST via `node-sql-parser`, then regenerates it under a target dialect.
 * Best-effort — mainly identifier-quoting and clause-syntax differences the
 * library itself understands, not a full semantic translation of every dialect
 * quirk (e.g. MySQL's LIMIT isn't rewritten to SQL Server's TOP).
 */
import esm_node_sql_parser from 'node-sql-parser';
const { Parser } = esm_node_sql_parser;
type Parser = InstanceType<typeof Parser>;

export type SqlConverterDialect = 'mysql' | 'mariadb' | 'postgresql' | 'sqlite' | 'transactsql';

export const SQL_CONVERTER_DIALECTS: readonly { readonly id: SqlConverterDialect; readonly label: string }[] = [
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'mariadb', label: 'MariaDB' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'transactsql', label: 'SQL Server (T-SQL)' },
];

export type SqlDialectConvertResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

export function convertSqlDialect(sql: string, from: SqlConverterDialect, to: SqlConverterDialect): SqlDialectConvertResult {
  if (sql.trim() === '') return { ok: false, error: 'Enter some SQL.' };

  const parser = new Parser();
  try {
    const ast = parser.astify(sql, { database: from });
    return { ok: true, output: parser.sqlify(ast, { database: to }) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to convert SQL.' };
  }
}
