import { describe, expect, it } from 'vitest';
import { emitPython } from "./model-generator-emit-python.js";
import { FlattenedModel } from "./model-generator-types.js";

describe('emitPython', () => {
  it('emits a dataclass with Optional defaults and a remap comment when the key changes case', () => {
    const model: FlattenedModel = {
      rootName: 'User',
      rootWasArray: false,
      definitions: [
        {
          name: 'User',
          fields: [
            { key: 'firstName', type: { kind: 'primitive', primitive: 'string' }, nullable: false },
            { key: 'age', type: { kind: 'primitive', primitive: 'integer' }, nullable: true },
          ],
        },
      ],
    };

    const result = emitPython(model);
    expect(result.code).toContain('from dataclasses import dataclass');
    expect(result.code).toContain('from typing import Optional');
    expect(result.code).toContain('@dataclass');
    expect(result.code).toContain('class User:');
    expect(result.code).toContain('first_name: str  # JSON key: "firstName"');
    expect(result.code).toContain('age: Optional[int] = None');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('imports Any for a field with no consistent type, even nested inside a List', () => {
    const model: FlattenedModel = {
      rootName: 'Thing',
      rootWasArray: false,
      definitions: [
        { name: 'Thing', fields: [{ key: 'items', type: { kind: 'array', of: { kind: 'unknown' } }, nullable: false }] },
      ],
    };
    const result = emitPython(model);
    expect(result.code).toContain('from typing import Any, List');
    expect(result.code).toContain('items: List[Any]');
  });

  it('emits an empty class body as pass', () => {
    const model: FlattenedModel = { rootName: 'Empty', rootWasArray: false, definitions: [{ name: 'Empty', fields: [] }] };
    const result = emitPython(model);
    expect(result.code).toContain('class Empty:\n    pass');
  });
});
