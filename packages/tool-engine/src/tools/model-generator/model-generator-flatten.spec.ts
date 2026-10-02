import { describe, expect, it } from 'vitest';
import { flattenModel } from "./model-generator-flatten.js";
import { InferredType } from "./model-generator-types.js";

describe('flattenModel', () => {
  it('flattens a flat object into a single definition', () => {
    const root: InferredType = {
      kind: 'object',
      fields: [{ key: 'name', type: { kind: 'primitive', primitive: 'string' }, nullable: false }],
    };
    const result = flattenModel(root, 'user');
    expect(result.rootWasArray).toBe(false);
    expect(result.definitions).toEqual([{ name: 'User', fields: [{ key: 'name', type: { kind: 'primitive', primitive: 'string' }, nullable: false }] }]);
    expect(result.rootName).toBe('User');
  });

  it('pulls a nested object out into its own named definition', () => {
    const root: InferredType = {
      kind: 'object',
      fields: [
        {
          key: 'address',
          type: { kind: 'object', fields: [{ key: 'city', type: { kind: 'primitive', primitive: 'string' }, nullable: false }] },
          nullable: false,
        },
      ],
    };
    const result = flattenModel(root, 'user');
    expect(result.definitions.map((d) => d.name)).toEqual(['User', 'Address']);
    const userDef = result.definitions[0];
    expect(userDef.fields[0].type).toEqual({ kind: 'ref', typeName: 'Address' });
  });

  it('singularizes an array-of-objects field name for the element type', () => {
    const root: InferredType = {
      kind: 'object',
      fields: [
        {
          key: 'orders',
          type: { kind: 'array', of: { kind: 'object', fields: [{ key: 'id', type: { kind: 'primitive', primitive: 'integer' }, nullable: false }] } },
          nullable: false,
        },
      ],
    };
    const result = flattenModel(root, 'customer');
    expect(result.definitions.map((d) => d.name)).toEqual(['Customer', 'Order']);
  });

  it('unwraps a top-level array and flags rootWasArray', () => {
    const root: InferredType = {
      kind: 'array',
      of: { kind: 'object', fields: [{ key: 'id', type: { kind: 'primitive', primitive: 'integer' }, nullable: false }] },
    };
    const result = flattenModel(root, 'item');
    expect(result.rootWasArray).toBe(true);
    expect(result.definitions.map((d) => d.name)).toEqual(['Item']);
  });

  it('disambiguates duplicate type names with a numeric suffix', () => {
    const address: InferredType = { kind: 'object', fields: [] };
    const root: InferredType = {
      kind: 'object',
      fields: [
        { key: 'primary', type: { kind: 'object', fields: [{ key: 'address', type: address, nullable: false }] }, nullable: false },
        { key: 'secondary', type: { kind: 'object', fields: [{ key: 'address', type: address, nullable: false }] }, nullable: false },
      ],
    };
    const result = flattenModel(root, 'user');
    const names = result.definitions.map((d) => d.name);
    expect(names).toContain('Address');
    expect(names).toContain('Address2');
    expect(new Set(names).size).toBe(names.length);
  });

  it('wraps a bare primitive root as a single-field definition', () => {
    const result = flattenModel({ kind: 'primitive', primitive: 'string' }, 'root');
    expect(result.definitions).toEqual([{ name: 'Root', fields: [{ key: 'value', type: { kind: 'primitive', primitive: 'string' }, nullable: false }] }]);
  });
});
