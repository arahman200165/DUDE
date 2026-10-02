import { describe, expect, it } from 'vitest';
import { emitSql } from "./model-generator-emit-sql.js";
import { FlattenedModel } from "./model-generator-types.js";

describe('emitSql', () => {
  it('emits a CREATE TABLE with a primary key and mapped column types', () => {
    const model: FlattenedModel = {
      rootName: 'User',
      rootWasArray: false,
      definitions: [
        {
          name: 'User',
          fields: [
            { key: 'firstName', type: { kind: 'primitive', primitive: 'string' }, nullable: false },
            { key: 'age', type: { kind: 'primitive', primitive: 'integer' }, nullable: true },
            { key: 'balance', type: { kind: 'primitive', primitive: 'number' }, nullable: false },
            { key: 'active', type: { kind: 'primitive', primitive: 'boolean' }, nullable: false },
          ],
        },
      ],
    };

    const result = emitSql(model);
    expect(result.code).toContain('CREATE TABLE user (');
    expect(result.code).toContain('id INTEGER PRIMARY KEY');
    expect(result.code).toContain('first_name VARCHAR(255) NOT NULL');
    expect(result.code).toContain('age INTEGER');
    expect(result.code).not.toContain('age INTEGER NOT NULL');
    expect(result.code).toContain('balance DOUBLE PRECISION NOT NULL');
    expect(result.code).toContain('active BOOLEAN NOT NULL');
    expect(result.warnings).toEqual([]);
  });

  it('flattens a nested object field to a TEXT column with a warning', () => {
    const model: FlattenedModel = {
      rootName: 'User',
      rootWasArray: false,
      definitions: [
        { name: 'User', fields: [{ key: 'address', type: { kind: 'ref', typeName: 'Address' }, nullable: false }] },
        { name: 'Address', fields: [] },
      ],
    };

    const result = emitSql(model);
    expect(result.code).toContain('address TEXT NOT NULL');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
