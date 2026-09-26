/**
 * Pure, framework-free static, pattern-based SQL query explanation — walks the
 * `node-sql-parser` AST of a SELECT statement and describes each clause in
 * plain English. Explicitly not a live `EXPLAIN` against a running database.
 */
import { Parser } from 'node-sql-parser';

export type SqlExplainerDialect = 'mysql' | 'mariadb' | 'postgresql' | 'sqlite' | 'transactsql';

export const SQL_EXPLAINER_DIALECTS: readonly { readonly id: SqlExplainerDialect; readonly label: string }[] = [
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'mariadb', label: 'MariaDB' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'transactsql', label: 'SQL Server (T-SQL)' },
];

export type SqlExplainResult = { readonly ok: true; readonly lines: readonly string[] } | { readonly ok: false; readonly error: string };

interface FromTable {
  readonly db?: string | null;
  readonly table?: string;
  readonly as?: string | null;
  readonly join?: string;
  readonly on?: unknown;
  readonly expr?: unknown;
}

interface SelectColumn {
  readonly expr: unknown;
  readonly as?: string | null;
}

interface OrderByEntry {
  readonly expr: unknown;
  readonly type?: string;
}

interface SelectAst {
  readonly type: string;
  readonly columns: readonly SelectColumn[] | '*';
  readonly from?: readonly FromTable[] | null;
  readonly where?: unknown;
  readonly groupby?: { readonly columns?: readonly unknown[] } | null;
  readonly having?: unknown;
  readonly orderby?: readonly OrderByEntry[] | null;
  readonly limit?: { readonly value?: readonly { readonly value: unknown }[] } | null;
}

function tableName(table: FromTable): string {
  const qualified = table.db ? `${table.db}.${table.table}` : (table.table ?? 'a subquery');
  return table.as ? `${qualified} (as ${table.as})` : qualified;
}

export function explainSqlQuery(sql: string, dialect: SqlExplainerDialect): SqlExplainResult {
  if (sql.trim() === '') return { ok: false, error: 'Enter some SQL.' };

  const parser = new Parser();
  let ast: unknown;
  try {
    ast = parser.astify(sql, { database: dialect });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse SQL.' };
  }

  if (Array.isArray(ast)) ast = ast[0];
  // A comment-only/empty-statement input (e.g. MySQL's "#" line-comment marker) parses
  // successfully to an empty statement list, leaving nothing at index 0.
  if (!ast) return { ok: false, error: 'No SQL statement found to explain.' };
  const select = ast as SelectAst;
  if (select.type !== 'select') {
    return { ok: false, error: `This explainer only supports SELECT statements (got "${select.type}").` };
  }

  const toSql = (expr: unknown): string => parser.exprToSQL(expr as never, { database: dialect } as never);

  // node-sql-parser's astify() succeeding doesn't guarantee every clause shape it can produce is
  // one exprToSQL (or the property accesses below) can render back -- an edge case here should
  // degrade to a clear error, not crash the tool (DUDE_PRD.md §21 Phase 23 Item 5).
  try {
    const lines: string[] = [];

    if (select.columns === '*') {
      lines.push('Selects all columns (*).');
    } else {
      const rendered = select.columns.map((column) => (column.as ? `${toSql(column.expr)} (as ${column.as})` : toSql(column.expr)));
      lines.push(rendered.length === 1 && rendered[0] === '*' ? 'Selects all columns (*).' : `Selects: ${rendered.join(', ')}.`);
    }

    const tables = select.from ?? [];
    const baseTables = tables.filter((table) => !table.join);
    if (baseTables.length > 0) {
      lines.push(`From: ${baseTables.map(tableName).join(', ')}.`);
    }
    for (const table of tables) {
      if (!table.join) continue;
      const condition = table.on ? ` on ${toSql(table.on)}` : '';
      lines.push(`${table.join} ${tableName(table)}${condition}.`);
    }

    if (select.where) lines.push(`Filters rows where: ${toSql(select.where)}.`);

    const groupColumns = select.groupby?.columns;
    if (groupColumns && groupColumns.length > 0) {
      lines.push(`Groups by: ${groupColumns.map(toSql).join(', ')}.`);
    }

    if (select.having) lines.push(`Filters groups where: ${toSql(select.having)}.`);

    if (select.orderby && select.orderby.length > 0) {
      const orderText = select.orderby.map((entry) => `${toSql(entry.expr)} ${entry.type ?? 'ASC'}`).join(', ');
      lines.push(`Orders by: ${orderText}.`);
    }

    const limitValue = select.limit?.value?.[0]?.value;
    if (limitValue !== undefined) lines.push(`Limits the result to ${limitValue} row(s).`);

    return { ok: true, lines };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `Could not explain this query: ${error.message}` : 'Could not explain this query.' };
  }
}
