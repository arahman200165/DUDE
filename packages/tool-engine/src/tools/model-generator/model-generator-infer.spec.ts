import { describe, expect, it } from 'vitest';
import { inferFromJson, inferType, mergeTypes } from "./model-generator-infer.js";

describe('inferType', () => {
  it('infers primitives', () => {
    expect(inferType('hi')).toEqual({ kind: 'primitive', primitive: 'string' });
    expect(inferType(42)).toEqual({ kind: 'primitive', primitive: 'integer' });
    expect(inferType(4.5)).toEqual({ kind: 'primitive', primitive: 'number' });
    expect(inferType(true)).toEqual({ kind: 'primitive', primitive: 'boolean' });
    expect(inferType(null)).toEqual({ kind: 'primitive', primitive: 'null' });
  });

  it('infers a flat object', () => {
    const result = inferType({ name: 'Ada', age: 30 });
    expect(result).toEqual({
      kind: 'object',
      fields: [
        { key: 'name', type: { kind: 'primitive', primitive: 'string' }, nullable: false },
        { key: 'age', type: { kind: 'primitive', primitive: 'integer' }, nullable: false },
      ],
    });
  });

  it('infers nested objects and arrays', () => {
    const result = inferType({ address: { city: 'NYC' }, tags: ['a', 'b'] });
    expect(result).toEqual({
      kind: 'object',
      fields: [
        {
          key: 'address',
          type: { kind: 'object', fields: [{ key: 'city', type: { kind: 'primitive', primitive: 'string' }, nullable: false }] },
          nullable: false,
        },
        { key: 'tags', type: { kind: 'array', of: { kind: 'primitive', primitive: 'string' } }, nullable: false },
      ],
    });
  });

  it('merges array elements with mismatched fields into nullable fields', () => {
    const result = inferType([{ id: 1, name: 'a' }, { id: 2 }]);
    expect(result).toEqual({
      kind: 'array',
      of: {
        kind: 'object',
        fields: [
          { key: 'id', type: { kind: 'primitive', primitive: 'integer' }, nullable: false },
          { key: 'name', type: { kind: 'primitive', primitive: 'string' }, nullable: true },
        ],
      },
    });
  });

  it('merges integer and number samples into number', () => {
    const result = inferType([1, 1.5]);
    expect(result).toEqual({ kind: 'array', of: { kind: 'primitive', primitive: 'number' } });
  });

  it('treats an empty array as unknown element type', () => {
    expect(inferType([])).toEqual({ kind: 'array', of: { kind: 'unknown' } });
  });
});

describe('mergeTypes', () => {
  it('keeps unknown out of the way of a real type seen elsewhere', () => {
    const unknown = { kind: 'unknown' } as const;
    const str = { kind: 'primitive', primitive: 'string' } as const;
    expect(mergeTypes(unknown, str)).toEqual(str);
    expect(mergeTypes(str, unknown)).toEqual(str);
  });

  it('falls back to unknown for incompatible shapes', () => {
    const str = { kind: 'primitive', primitive: 'string' } as const;
    const obj = { kind: 'object', fields: [] } as const;
    expect(mergeTypes(str, obj)).toEqual({ kind: 'unknown' });
  });
});

describe('inferFromJson', () => {
  it('rejects empty input', () => {
    const result = inferFromJson('   ');
    expect(result.ok).toBe(false);
  });

  it('rejects invalid JSON', () => {
    const result = inferFromJson('{not json}');
    expect(result.ok).toBe(false);
  });

  it('parses and infers valid JSON', () => {
    const result = inferFromJson('{"id": 1}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.root.kind).toBe('object');
    }
  });
});
