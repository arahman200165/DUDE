import { describe, expect, it } from 'vitest';
import { emitSwift } from "./model-generator-emit-swift.js";
import { FlattenedModel } from "./model-generator-types.js";

describe('emitSwift', () => {
  it('emits a Codable struct with CodingKeys when a key needs remapping', () => {
    const model: FlattenedModel = {
      rootName: 'User',
      rootWasArray: false,
      definitions: [
        {
          name: 'User',
          fields: [
            { key: 'first_name', type: { kind: 'primitive', primitive: 'string' }, nullable: false },
            { key: 'age', type: { kind: 'primitive', primitive: 'integer' }, nullable: true },
          ],
        },
      ],
    };

    const result = emitSwift(model);
    expect(result.code).toContain('struct User: Codable {');
    expect(result.code).toContain('let firstName: String');
    expect(result.code).toContain('let age: Int?');
    expect(result.code).toContain('enum CodingKeys: String, CodingKey {');
    expect(result.code).toContain('case firstName = "first_name"');
    expect(result.code).toContain('case age');
  });

  it('omits CodingKeys when every key already matches its camelCase property name', () => {
    const model: FlattenedModel = {
      rootName: 'Point',
      rootWasArray: false,
      definitions: [{ name: 'Point', fields: [{ key: 'x', type: { kind: 'primitive', primitive: 'integer' }, nullable: false }] }],
    };
    const result = emitSwift(model);
    expect(result.code).not.toContain('CodingKeys');
  });

  it('warns when a field falls back to the unknown placeholder type', () => {
    const model: FlattenedModel = {
      rootName: 'Weird',
      rootWasArray: false,
      definitions: [{ name: 'Weird', fields: [{ key: 'value', type: { kind: 'unknown' }, nullable: false }] }],
    };
    const result = emitSwift(model);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
