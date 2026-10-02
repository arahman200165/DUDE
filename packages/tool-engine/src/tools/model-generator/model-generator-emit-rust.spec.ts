import { describe, expect, it } from 'vitest';
import { emitRust } from "./model-generator-emit-rust.js";
import { FlattenedModel } from "./model-generator-types.js";

describe('emitRust', () => {
  it('emits a derive(Serialize, Deserialize) struct with a rename attribute and Option wrapping', () => {
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

    const result = emitRust(model);
    expect(result.code).toContain('use serde::{Deserialize, Serialize};');
    expect(result.code).toContain('#[derive(Debug, Serialize, Deserialize)]');
    expect(result.code).toContain('pub struct User {');
    expect(result.code).toContain('#[serde(rename = "firstName")]');
    expect(result.code).toContain('pub first_name: String,');
    expect(result.code).toContain('pub age: Option<i64>,');
  });

  it('warns when a field falls back to serde_json::Value', () => {
    const model: FlattenedModel = {
      rootName: 'Thing',
      rootWasArray: false,
      definitions: [{ name: 'Thing', fields: [{ key: 'value', type: { kind: 'unknown' }, nullable: false }] }],
    };
    const result = emitRust(model);
    expect(result.code).toContain('pub value: serde_json::Value,');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
