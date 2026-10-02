import { FieldPrimitive, InferredField, InferredType } from "./model-generator-types.js";

function primitiveOf(value: unknown): FieldPrimitive {
  if (value === null) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return 'unknown';
}

function mergePrimitive(a: FieldPrimitive, b: FieldPrimitive): FieldPrimitive {
  if (a === b) return a;
  if ((a === 'integer' && b === 'number') || (a === 'number' && b === 'integer')) return 'number';
  if (a === 'null') return b;
  if (b === 'null') return a;
  return 'unknown';
}

/** Merges two shapes seen for the same field/array-element across multiple JSON samples. */
export function mergeTypes(a: InferredType, b: InferredType): InferredType {
  if (a.kind === 'unknown') return b;
  if (b.kind === 'unknown') return a;
  if (a.kind === 'primitive' && b.kind === 'primitive') {
    return { kind: 'primitive', primitive: mergePrimitive(a.primitive, b.primitive) };
  }
  if (a.kind === 'array' && b.kind === 'array') {
    return { kind: 'array', of: mergeTypes(a.of, b.of) };
  }
  if (a.kind === 'object' && b.kind === 'object') {
    return { kind: 'object', fields: mergeFields(a.fields, b.fields) };
  }
  return { kind: 'unknown' };
}

function mergeFields(a: readonly InferredField[], b: readonly InferredField[]): InferredField[] {
  const byKey = new Map<string, InferredField>();
  for (const field of a) byKey.set(field.key, field);

  for (const field of b) {
    const existing = byKey.get(field.key);
    byKey.set(
      field.key,
      existing
        ? { key: field.key, type: mergeTypes(existing.type, field.type), nullable: existing.nullable || field.nullable }
        : { ...field, nullable: true }, // present only in some array elements => treat as optional/nullable
    );
  }

  for (const field of a) {
    if (!b.some((candidate) => candidate.key === field.key)) {
      const merged = byKey.get(field.key);
      if (merged) byKey.set(field.key, { ...merged, nullable: true });
    }
  }

  return [...byKey.values()];
}

/** Walks a parsed JSON value into the language-agnostic `InferredType` shape. */
export function inferType(value: unknown): InferredType {
  if (value === null) return { kind: 'primitive', primitive: 'null' };

  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'array', of: { kind: 'unknown' } };
    const elementType = value.map((element) => inferType(element)).reduce((acc, next) => mergeTypes(acc, next));
    return { kind: 'array', of: elementType };
  }

  if (typeof value === 'object') {
    const fields: InferredField[] = Object.entries(value as Record<string, unknown>).map(([key, fieldValue]) => ({
      key,
      type: inferType(fieldValue),
      nullable: fieldValue === null,
    }));
    return { kind: 'object', fields };
  }

  return { kind: 'primitive', primitive: primitiveOf(value) };
}

export type ModelInferResult = { readonly ok: true; readonly root: InferredType } | { readonly ok: false; readonly error: string };

/** Parses JSON text and infers its shape. The one fallible entry point the component/worker calls. */
export function inferFromJson(input: string): ModelInferResult {
  if (input.trim() === '') return { ok: false, error: 'Enter JSON to generate a model from.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }

  return { ok: true, root: inferType(parsed) };
}
