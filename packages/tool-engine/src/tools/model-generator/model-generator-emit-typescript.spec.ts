import { describe, expect, it } from 'vitest';
import { emitTypeScript } from "./model-generator-emit-typescript.js";
import { FlattenedModel } from "./model-generator-types.js";

describe('emitTypeScript', () => {
  it('emits an interface with a nested ref and an array field', () => {
    const model: FlattenedModel = {
      rootName: 'User',
      rootWasArray: false,
      definitions: [
        {
          name: 'User',
          fields: [
            { key: 'id', type: { kind: 'primitive', primitive: 'integer' }, nullable: false },
            { key: 'nickname', type: { kind: 'primitive', primitive: 'string' }, nullable: true },
            { key: 'address', type: { kind: 'ref', typeName: 'Address' }, nullable: false },
            { key: 'tags', type: { kind: 'array', of: { kind: 'primitive', primitive: 'string' } }, nullable: false },
          ],
        },
        { name: 'Address', fields: [{ key: 'city', type: { kind: 'primitive', primitive: 'string' }, nullable: false }] },
      ],
    };

    const result = emitTypeScript(model);
    expect(result.code).toContain('export interface User {');
    expect(result.code).toContain('id: number;');
    expect(result.code).toContain('nickname?: string;');
    expect(result.code).toContain('address: Address;');
    expect(result.code).toContain('tags: string[];');
    expect(result.code).toContain('export interface Address {');
  });

  it('adds a list type alias when the root JSON was an array', () => {
    const model: FlattenedModel = { rootName: 'Item', rootWasArray: true, definitions: [{ name: 'Item', fields: [] }] };
    const result = emitTypeScript(model);
    expect(result.code).toContain('export type ItemList = Item[];');
  });
});
