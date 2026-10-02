/**
 * Pure, framework-free schema diffing: parses two `CREATE TABLE` statements
 * via `node-sql-parser` into a normalized `{ columnName: { dataType, length,
 * nullable } }` object, then reuses Advanced Diff's `diffTrees()` (built on
 * `fast-json-patch`) for the structural comparison rather than a bespoke
 * column-list diff algorithm.
 */
import esm_node_sql_parser from 'node-sql-parser';
const { Parser } = esm_node_sql_parser;
type Parser = InstanceType<typeof Parser>;
import { diffTrees, type TreeDiffResult } from "../advanced-diff/object-tree-diff.js";

export type SchemaDiffDialect = 'mysql' | 'mariadb' | 'postgresql' | 'sqlite' | 'transactsql';

export const SCHEMA_DIFF_DIALECTS: readonly { readonly id: SchemaDiffDialect; readonly label: string }[] = [
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'mariadb', label: 'MariaDB' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'transactsql', label: 'SQL Server (T-SQL)' },
];

export interface NormalizedColumn {
  readonly dataType: string;
  readonly length?: number;
  readonly nullable: boolean;
}

export type NormalizedSchema = Record<string, NormalizedColumn>;

interface ColumnDefinition {
  readonly resource: string;
  readonly column?: { readonly column?: { readonly expr?: { readonly value?: string } } };
  readonly definition?: { readonly dataType?: string; readonly length?: number };
  readonly nullable?: { readonly value?: string };
}

interface CreateTableAst {
  readonly type: string;
  readonly keyword?: string;
  readonly table?: readonly { readonly table?: string }[];
  readonly create_definitions?: readonly ColumnDefinition[];
}

type NormalizeResult = { readonly ok: true; readonly tableName: string; readonly columns: NormalizedSchema } | { readonly ok: false; readonly error: string };

function normalizeCreateTable(sql: string, dialect: SchemaDiffDialect): NormalizeResult {
  if (sql.trim() === '') return { ok: false, error: 'Enter a CREATE TABLE statement.' };

  const parser = new Parser();
  let ast: unknown;
  try {
    ast = parser.astify(sql, { database: dialect });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse SQL.' };
  }
  if (Array.isArray(ast)) ast = ast[0];

  const create = ast as CreateTableAst;
  if (create.type !== 'create' || create.keyword !== 'table') {
    return { ok: false, error: `Expected a single CREATE TABLE statement (got "${create.type}").` };
  }

  const columns: Record<string, NormalizedColumn> = {};
  for (const definition of create.create_definitions ?? []) {
    if (definition.resource !== 'column') continue;
    const name = definition.column?.column?.expr?.value;
    if (!name) continue;

    const dataType = definition.definition?.dataType ?? 'UNKNOWN';
    const length = definition.definition?.length;
    const nullable = definition.nullable?.value !== 'not null';
    columns[name] = length !== undefined ? { dataType, length, nullable } : { dataType, nullable };
  }

  return { ok: true, tableName: create.table?.[0]?.table ?? 'table', columns };
}

export type SchemaDiffResult = { readonly ok: true; readonly diff: TreeDiffResult } | { readonly ok: false; readonly error: string };

export function diffSchemas(sqlBefore: string, sqlAfter: string, dialect: SchemaDiffDialect): SchemaDiffResult {
  const before = normalizeCreateTable(sqlBefore, dialect);
  if (!before.ok) return { ok: false, error: `Before: ${before.error}` };

  const after = normalizeCreateTable(sqlAfter, dialect);
  if (!after.ok) return { ok: false, error: `After: ${after.error}` };

  return { ok: true, diff: diffTrees(before.columns, after.columns, { ignoreCase: false }) };
}
