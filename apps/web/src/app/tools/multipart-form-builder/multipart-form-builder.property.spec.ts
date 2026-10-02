import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { MultipartField, buildMultipartBody, contentTypeHeader, generateBoundary } from "@dude/tool-engine/tools/multipart-form-builder/multipart-build";

const textFieldArb = fc.record({ kind: fc.constant('text' as const), key: fc.string(), value: fc.string() });
const fileFieldArb = fc.record({
  kind: fc.constant('file' as const),
  key: fc.string(),
  filename: fc.string(),
  contentType: fc.string(),
  size: fc.nat(),
});
const fieldArb: fc.Arbitrary<MultipartField> = fc.oneof(textFieldArb, fileFieldArb);
const fieldsArb = fc.array(fieldArb, { maxLength: 5 });

describe('multipart-build fuzzing (pure core)', () => {
  it('generateBoundary/contentTypeHeader never throw for arbitrary strings', () => {
    neverThrows((hex: string) => generateBoundary(hex), fc.string(), {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
    neverThrows((boundary: string) => contentTypeHeader(boundary), fc.string(), {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
  });

  it('buildMultipartBody never throws and always ends with the closing boundary', () => {
    invariant(
      (input: { fields: readonly MultipartField[]; boundary: string }) => buildMultipartBody(input.fields, input.boundary),
      fc.record({ fields: fieldsArb, boundary: fc.string() }),
      (result, input) => result.endsWith(`--${input.boundary}--`),
    );
  });

  it('buildMultipartBody produces just the closing boundary when every field has an empty key', () => {
    const allEmptyKeyFields = fc.array(fieldArb.map((f) => ({ ...f, key: '' })), { maxLength: 5 });
    invariant(
      (input: { fields: readonly MultipartField[]; boundary: string }) => buildMultipartBody(input.fields, input.boundary),
      fc.record({ fields: allEmptyKeyFields, boundary: fc.string() }),
      (result, input) => result === `--${input.boundary}--`,
    );
  });
});
