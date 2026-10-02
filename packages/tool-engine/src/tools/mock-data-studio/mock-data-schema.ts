/**
 * Pure, framework-free schema-driven mock data generation: a flat
 * `{ field: "faker.path" }` JSON schema resolved into `@faker-js/faker`
 * methods, called with no arguments. Deliberately restricted to zero-arg
 * calls (dry-run-caught at generation time, not reflected on ahead of time) —
 * matching Random Data Generator's stated caution that a runtime dispatch
 * into arbitrary faker methods can't safely supply required arguments.
 */
import { faker } from '@faker-js/faker';

export type MockDataSchema = Record<string, string>;

export type ParseSchemaResult =
  | { readonly ok: true; readonly schema: MockDataSchema }
  | { readonly ok: false; readonly error: string };

export function parseSchema(text: string): ParseSchemaResult {
  if (text.trim() === '') return { ok: false, error: 'Enter a schema.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Schema must be a JSON object mapping field name to a faker path, e.g. { "name": "person.fullName" }.' };
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) return { ok: false, error: 'Schema has no fields.' };
  for (const [key, value] of entries) {
    if (typeof value !== 'string') return { ok: false, error: `Field "${key}" must map to a string faker path.` };
  }

  return { ok: true, schema: parsed as MockDataSchema };
}

type ResolvePathResult = { readonly ok: true; readonly fn: () => unknown } | { readonly ok: false; readonly error: string };

/** Keeps the method's parent object as `this`-context (`parent[lastSegment]()`, not a detached call) — several faker modules rely on it. */
function resolveFakerPath(path: string): ResolvePathResult {
  const segments = path
    .trim()
    .split('.')
    .filter((segment) => segment !== '');
  if (segments.length < 2) {
    return { ok: false, error: `"${path}" must be a dotted path like "person.fullName".` };
  }

  let parent: unknown = faker;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (parent === null || typeof parent !== 'object' || !(segment in parent)) {
      return { ok: false, error: `Unknown faker path "${path}".` };
    }
    parent = (parent as Record<string, unknown>)[segment];
  }

  const lastSegment = segments[segments.length - 1];
  if (parent === null || typeof parent !== 'object' || !(lastSegment in parent)) {
    return { ok: false, error: `Unknown faker path "${path}".` };
  }
  const method = (parent as Record<string, unknown>)[lastSegment];
  if (typeof method !== 'function') {
    return { ok: false, error: `"${path}" is not a callable faker method.` };
  }

  const holder = parent as Record<string, () => unknown>;
  return { ok: true, fn: () => holder[lastSegment]() };
}

export interface GenerateOptions {
  readonly rowCount: number;
  readonly seed?: number;
}

export type MockDataRow = Record<string, unknown>;

export type GenerateResult =
  | { readonly ok: true; readonly rows: readonly MockDataRow[] }
  | { readonly ok: false; readonly error: string };

export function generateMockData(schema: MockDataSchema, opts: GenerateOptions): GenerateResult {
  const fieldNames = Object.keys(schema);
  if (fieldNames.length === 0) return { ok: false, error: 'Schema has no fields.' };
  if (!Number.isInteger(opts.rowCount) || opts.rowCount < 1 || opts.rowCount > 1000) {
    return { ok: false, error: 'Row count must be an integer between 1 and 1000.' };
  }

  const resolved: { readonly key: string; readonly fn: () => unknown }[] = [];
  for (const key of fieldNames) {
    const result = resolveFakerPath(schema[key]);
    if (!result.ok) return { ok: false, error: `Field "${key}": ${result.error}` };
    resolved.push({ key, fn: result.fn });
  }

  if (opts.seed !== undefined) faker.seed(opts.seed);

  const rows: MockDataRow[] = [];
  for (let i = 0; i < opts.rowCount; i++) {
    const row: MockDataRow = {};
    for (const { key, fn } of resolved) {
      try {
        row[key] = fn();
      } catch (error) {
        return {
          ok: false,
          error: `Field "${key}" (${schema[key]}) failed to generate: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    rows.push(row);
  }

  return { ok: true, rows };
}
