import { describe, expect, it } from 'vitest';
import { emitJava } from "./model-generator-emit-java.js";
import { FlattenedModel } from "./model-generator-types.js";

describe('emitJava', () => {
  it('emits a POJO with private fields, getters/setters, and @JsonProperty when the key differs', () => {
    const model: FlattenedModel = {
      rootName: 'User',
      rootWasArray: false,
      definitions: [
        {
          name: 'User',
          fields: [
            { key: 'first_name', type: { kind: 'primitive', primitive: 'string' }, nullable: false },
            { key: 'tags', type: { kind: 'array', of: { kind: 'primitive', primitive: 'string' } }, nullable: false },
          ],
        },
      ],
    };

    const result = emitJava(model);
    expect(result.code).toContain('public class User {');
    expect(result.code).toContain('@JsonProperty("first_name")');
    expect(result.code).toContain('private String firstName;');
    expect(result.code).toContain('public String getFirstName() {');
    expect(result.code).toContain('public void setFirstName(String firstName) {');
    expect(result.code).toContain('private List<String> tags;');
    expect(result.code).toContain('import java.util.List;');
  });
});
