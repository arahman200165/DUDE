/** Pure, framework-free SQL syntax checking, built on `node-sql-parser`'s AST-producing parser. */
import esm_node_sql_parser from 'node-sql-parser';
const { Parser } = esm_node_sql_parser;
type Parser = InstanceType<typeof Parser>;

export type SqlCheckerDialect = 'mysql' | 'mariadb' | 'postgresql' | 'sqlite' | 'transactsql';

export const SQL_CHECKER_DIALECTS: readonly { readonly id: SqlCheckerDialect; readonly label: string }[] = [
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'mariadb', label: 'MariaDB' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'transactsql', label: 'SQL Server (T-SQL)' },
];

export interface SqlSyntaxLocation {
  readonly line: number;
  readonly column: number;
}

export type SqlSyntaxCheckResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly location?: SqlSyntaxLocation };

interface ParserSyntaxError {
  readonly message: string;
  readonly location?: { readonly start: { readonly line: number; readonly column: number } };
}

function isParserSyntaxError(error: unknown): error is ParserSyntaxError {
  return typeof error === 'object' && error !== null && 'message' in error;
}

export function checkSqlSyntax(sql: string, dialect: SqlCheckerDialect): SqlSyntaxCheckResult {
  if (sql.trim() === '') return { ok: false, message: 'Enter some SQL.' };

  const parser = new Parser();
  try {
    parser.astify(sql, { database: dialect });
    return { ok: true };
  } catch (error) {
    if (isParserSyntaxError(error)) {
      return {
        ok: false,
        message: error.message,
        location: error.location ? { line: error.location.start.line, column: error.location.start.column } : undefined,
      };
    }
    return { ok: false, message: 'Failed to parse SQL.' };
  }
}
