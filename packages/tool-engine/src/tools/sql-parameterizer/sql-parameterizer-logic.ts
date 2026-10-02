/**
 * Pure, framework-free SQL parameterization: parses SQL to an AST via
 * `node-sql-parser`, replaces literal-value nodes with placeholder ("param")
 * nodes, and regenerates SQL from the transformed AST — rather than
 * regex-substituting literals in the raw text, which can't reliably tell a
 * literal apart from an identifier or a string containing SQL-like text.
 */
import esm_node_sql_parser from 'node-sql-parser';
const { Parser } = esm_node_sql_parser;
type Parser = InstanceType<typeof Parser>;

export type SqlParameterizerDialect = 'mysql' | 'mariadb' | 'postgresql' | 'sqlite' | 'transactsql';

export const SQL_PARAMETERIZER_DIALECTS: readonly { readonly id: SqlParameterizerDialect; readonly label: string }[] = [
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'mariadb', label: 'MariaDB' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'transactsql', label: 'SQL Server (T-SQL)' },
];

export type SqlParamStyle = 'question' | 'dollar' | 'named';

export const SQL_PARAM_STYLES: readonly { readonly id: SqlParamStyle; readonly label: string }[] = [
  { id: 'question', label: '? (positional)' },
  { id: 'dollar', label: '$1, $2, … (PostgreSQL)' },
  { id: 'named', label: ':p1, :p2, … (named)' },
];

const LITERAL_TYPES = new Set(['number', 'single_quote_string', 'double_quote_string', 'bool', 'boolean', 'bigint', 'hex_string']);

function isLiteralNode(node: unknown): node is { readonly type: string; readonly value: unknown } {
  return typeof node === 'object' && node !== null && 'type' in node && LITERAL_TYPES.has(String((node as { type: unknown }).type));
}

function walk(node: unknown, values: unknown[], style: SqlParamStyle): unknown {
  if (Array.isArray(node)) return node.map((item) => walk(item, values, style));

  if (node !== null && typeof node === 'object') {
    if (isLiteralNode(node)) {
      values.push(node.value);
      const index = values.length;
      if (style === 'question') return { type: 'param', prefix: '?', value: '' };
      if (style === 'dollar') return { type: 'param', prefix: '$', value: index };
      return { type: 'param', prefix: ':', value: `p${index}` };
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      result[key] = walk(value, values, style);
    }
    return result;
  }

  return node;
}

export type SqlParameterizeResult =
  | { readonly ok: true; readonly sql: string; readonly values: readonly unknown[] }
  | { readonly ok: false; readonly error: string };

export function parameterizeSql(sql: string, dialect: SqlParameterizerDialect, style: SqlParamStyle): SqlParameterizeResult {
  if (sql.trim() === '') return { ok: false, error: 'Enter some SQL.' };

  const parser = new Parser();
  let ast: unknown;
  try {
    ast = parser.astify(sql, { database: dialect });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse SQL.' };
  }

  const values: unknown[] = [];
  const transformed = walk(ast, values, style);

  try {
    return { ok: true, sql: parser.sqlify(transformed as Parameters<Parser['sqlify']>[0], { database: dialect }), values };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to regenerate SQL from the parameterized AST.' };
  }
}
