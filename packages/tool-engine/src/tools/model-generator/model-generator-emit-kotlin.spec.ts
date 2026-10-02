import { describe, expect, it } from 'vitest';
import { emitKotlin } from "./model-generator-emit-kotlin.js";
import { FlattenedModel } from "./model-generator-types.js";

describe('emitKotlin', () => {
  it('emits a @Serializable data class with @SerialName and nullable defaults', () => {
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

    const result = emitKotlin(model);
    expect(result.code).toContain('import kotlinx.serialization.Serializable');
    expect(result.code).toContain('import kotlinx.serialization.SerialName');
    expect(result.code).toContain('@Serializable');
    expect(result.code).toContain('data class User(');
    expect(result.code).toContain('@SerialName("first_name") val firstName: String');
    expect(result.code).toContain('val age: Int? = null');
  });
});
