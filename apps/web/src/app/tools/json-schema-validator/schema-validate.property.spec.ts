import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { validateJsonSchema } from "@dude/tool-engine/tools/json-schema-validator/schema-validate";

describe('JSON Schema validator properties', () => {
  it('returns a typed result for arbitrary schema and instance text', () => {
    neverThrows(([schema, instance]: [string, string]) => validateJsonSchema(schema, instance, 'auto'),
      fc.tuple(fc.string(), fc.string()), {
        assertShape: (result) => expect(typeof result).toBe('object'),
      });
  });
});
