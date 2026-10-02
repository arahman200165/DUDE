/** Primitive kinds an inferred JSON value can settle into. */
export type FieldPrimitive = 'string' | 'integer' | 'number' | 'boolean' | 'null' | 'unknown';

/** Intermediate shape produced by walking parsed JSON, before flattening into named definitions. */
export type InferredType =
  | { readonly kind: 'primitive'; readonly primitive: FieldPrimitive }
  | { readonly kind: 'array'; readonly of: InferredType }
  | { readonly kind: 'object'; readonly fields: readonly InferredField[] }
  | { readonly kind: 'unknown' };

export interface InferredField {
  readonly key: string;
  readonly type: InferredType;
  readonly nullable: boolean;
}

/** A field's value type once every nested object has been assigned a name and pulled out as its own definition. */
export type FieldValueType =
  | { readonly kind: 'primitive'; readonly primitive: FieldPrimitive }
  | { readonly kind: 'ref'; readonly typeName: string }
  | { readonly kind: 'array'; readonly of: FieldValueType }
  | { readonly kind: 'unknown' };

export interface ModelField {
  readonly key: string;
  readonly type: FieldValueType;
  readonly nullable: boolean;
}

export interface ModelDefinition {
  readonly name: string;
  readonly fields: readonly ModelField[];
}

/** Flattened, language-agnostic model: every named type plus which one is the root. */
export interface FlattenedModel {
  readonly definitions: readonly ModelDefinition[];
  readonly rootName: string;
  /** True when the original JSON input was a top-level array — the root type describes one element. */
  readonly rootWasArray: boolean;
}

export interface EmitResult {
  readonly code: string;
  readonly warnings: readonly string[];
}
