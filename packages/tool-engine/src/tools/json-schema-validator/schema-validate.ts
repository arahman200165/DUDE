/**
 * Pure, framework-free JSON Schema validation used by the JSON Schema
 * Validator tool. Supports both Draft-07 and 2020-12, auto-detected from
 * the schema's `$schema` keyword (defaulting to Draft-07 when absent),
 * with a manual override.
 *
 * Engine choice (PD-056): `@cfworker/json-schema`, an interpreter. The user supplies the schema at runtime, and
 * ajv compiles every schema to JavaScript with `new Function`, which the Hub's page CSP (no `'unsafe-eval'`, ever)
 * blocks. An interpreter needs no eval, keeps one code path on Pages, desktop and Hub, and runs in a Worker as
 * before. Its raw output is nested (a parent error per failing `properties`/`items`/`$ref` plus the leaf errors),
 * so `toLeafErrors` flattens it to the leaf-style list ajv produced.
 */

import { Validator, type OutputUnit, type Schema } from '@cfworker/json-schema';

export type SchemaDraft = 'draft-07' | '2020-12';
export type SchemaDraftMode = 'auto' | SchemaDraft;

export interface SchemaValidationError {
  readonly instancePath: string;
  readonly message: string;
  readonly keyword: string;
  readonly params?: Record<string, unknown>;
}

export type SchemaValidateResult =
  | { readonly ok: true; readonly draft: SchemaDraft }
  | {
      readonly ok: false;
      readonly stage: 'schema-json' | 'instance-json' | 'schema-compile';
      readonly message: string;
    }
  | {
      readonly ok: false;
      readonly stage: 'validation';
      readonly draft: SchemaDraft;
      readonly errors: readonly SchemaValidationError[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function detectDraft(schema: unknown): SchemaDraft {
  const dialect = isRecord(schema) ? schema['$schema'] : undefined;
  return typeof dialect === 'string' && dialect.includes('2020-12') ? '2020-12' : 'draft-07';
}

function resolveDraft(schema: unknown, draftMode: SchemaDraftMode): SchemaDraft {
  return draftMode === 'auto' ? detectDraft(schema) : draftMode;
}

/** Structural parents whose message only says "a subschema failed"; the leaf errors beneath them carry the detail. */
const WRAPPER_KEYWORDS: ReadonlySet<string> = new Set([
  'properties',
  'patternProperties',
  'items',
  'prefixItems',
  'additionalItems',
  '$ref',
  '$recursiveRef',
  '$dynamicRef',
  'allOf',
  'dependentSchemas',
  'dependencies',
]);

function toLeafErrors(raw: readonly OutputUnit[]): readonly SchemaValidationError[] {
  const hasAdditional = raw.some((unit) => unit.keyword === 'additionalProperties');
  const kept = raw.filter(
    (unit) => !WRAPPER_KEYWORDS.has(unit.keyword) && !(hasAdditional && unit.keyword === 'false'),
  );
  return (kept.length > 0 ? kept : raw).map((unit) => ({
    // cfworker locations are `#` / `#/a/0`; the tool shows `/` / `/a/0`.
    instancePath: unit.instanceLocation.replace(/^#/, '') === '' ? '/' : unit.instanceLocation.replace(/^#/, ''),
    message: unit.error,
    keyword: unit.keyword,
  }));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function validateJsonSchema(
  schemaText: string,
  instanceText: string,
  draftMode: SchemaDraftMode,
): SchemaValidateResult {
  let schema: unknown;
  try {
    schema = JSON.parse(schemaText);
  } catch (error) {
    return { ok: false, stage: 'schema-json', message: `Schema is not valid JSON: ${describeError(error)}` };
  }

  let instance: unknown;
  try {
    instance = JSON.parse(instanceText);
  } catch (error) {
    return { ok: false, stage: 'instance-json', message: `Instance is not valid JSON: ${describeError(error)}` };
  }

  const draft = resolveDraft(schema, draftMode);

  // `shortCircuit: false` reports every error, as ajv's `allErrors` did. Patterns and `$ref`s are resolved while
  // validating, so a bad schema surfaces here and is reported as the compile stage.
  try {
    const validator = new Validator(schema as Schema | boolean, draft === '2020-12' ? '2020-12' : '7', false);
    const result = validator.validate(instance);
    if (result.valid) return { ok: true, draft };
    return { ok: false, stage: 'validation', draft, errors: toLeafErrors(result.errors) };
  } catch (error) {
    return { ok: false, stage: 'schema-compile', message: describeError(error) };
  }
}
