import { describe, expect, it } from 'vitest';
import { emitGo } from "./model-generator-emit-go.js";
import { FlattenedModel } from "./model-generator-types.js";

describe('emitGo', () => {
  it('emits an exported struct with json tags and a pointer for nullable primitives', () => {
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

    const result = emitGo(model);
    expect(result.code).toContain('type User struct {');
    expect(result.code).toContain('FirstName string `json:"first_name"`');
    expect(result.code).toContain('Age *int64 `json:"age,omitempty"`');
    expect(result.code).toContain('Tags []string `json:"tags"`');
  });
});
