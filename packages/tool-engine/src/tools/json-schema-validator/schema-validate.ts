/**
 * Pure, framework-free JSON Schema validation used by the JSON Schema
 * Validator tool. Supports both Draft-07 and 2020-12, auto-detected from
 * the schema's `$schema` keyword (defaulting to Draft-07 when absent,
 * matching ajv's own core-class default dialect), with a manual override.
 */

import Ajv, { ErrorObject } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

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

/**
 * Drops a schema's own `$schema` declaration when the user has explicitly
 * overridden the draft — otherwise ajv still tries to resolve the declared
 * meta-schema URI and throws "no schema with key or ref ..." for a dialect
 * the chosen Ajv instance doesn't register, defeating the override.
 */
function withDraftOverride(schema: unknown, draftMode: SchemaDraftMode): unknown {
  if (draftMode === 'auto' || !isRecord(schema)) return schema;
  const { $schema: _dialect, ...rest } = schema;
  return rest;
}

function createValidatorInstance(draft: SchemaDraft): Ajv {
  // `strict: false` is a deliberate leniency choice: real-world schemas
  // often carry vendor/unknown keywords that ajv's strict mode would
  // otherwise throw on — don't "fix" this to `true` without checking
  // whether that breaks previously-tolerated schemas.
  const AjvClass = draft === '2020-12' ? Ajv2020 : Ajv;
  const ajv = new AjvClass({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
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
  const ajv = createValidatorInstance(draft);

  let validate: ReturnType<Ajv['compile']>;
  try {
    validate = ajv.compile(withDraftOverride(schema, draftMode) as object);
  } catch (error) {
    return { ok: false, stage: 'schema-compile', message: describeError(error) };
  }

  if (validate(instance)) return { ok: true, draft };

  const errors: readonly SchemaValidationError[] = (validate.errors ?? []).map((error: ErrorObject) => ({
    instancePath: error.instancePath === '' ? '/' : error.instancePath,
    message: error.message ?? 'is invalid',
    keyword: error.keyword,
    params: error.params,
  }));

  return { ok: false, stage: 'validation', draft, errors };
}
