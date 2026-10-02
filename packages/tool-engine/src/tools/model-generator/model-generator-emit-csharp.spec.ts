import { describe, expect, it } from 'vitest';
import { emitCSharp } from "./model-generator-emit-csharp.js";
import { FlattenedModel } from "./model-generator-types.js";

describe('emitCSharp', () => {
  it('emits PascalCase properties with a JsonPropertyName attribute when the key differs', () => {
    const model: FlattenedModel = {
      rootName: 'User',
      rootWasArray: false,
      definitions: [
        {
          name: 'User',
          fields: [
            { key: 'first_name', type: { kind: 'primitive', primitive: 'string' }, nullable: false },
            { key: 'age', type: { kind: 'primitive', primitive: 'integer' }, nullable: true },
            { key: 'tags', type: { kind: 'array', of: { kind: 'primitive', primitive: 'string' } }, nullable: false },
          ],
        },
      ],
    };

    const result = emitCSharp(model);
    expect(result.code).toContain('public class User');
    expect(result.code).toContain('[JsonPropertyName("first_name")]');
    expect(result.code).toContain('public string FirstName { get; set; }');
    expect(result.code).toContain('public int? Age { get; set; }');
    expect(result.code).toContain('public List<string> Tags { get; set; }');
    expect(result.code).toContain('using System.Text.Json.Serialization;');
    expect(result.code).toContain('using System.Collections.Generic;');
  });

  it('omits the JsonPropertyName attribute and using directive when no key needs remapping', () => {
    const model: FlattenedModel = {
      rootName: 'Point',
      rootWasArray: false,
      definitions: [
        {
          name: 'Point',
          fields: [{ key: 'X', type: { kind: 'primitive', primitive: 'integer' }, nullable: false }],
        },
      ],
    };
    const result = emitCSharp(model);
    expect(result.code).not.toContain('JsonPropertyName');
    expect(result.code).not.toContain('using System.Text.Json.Serialization;');
  });
});
