import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, invariant } from "../../../../../../tests/property-harness";
import { extensionForFormat, replaceExtension, type ImageOutputFormat } from "@dude/tool-engine/tools/image-format-converter/format-mime";

const formatArb: fc.Arbitrary<ImageOutputFormat> = fc.constantFrom('image/png', 'image/jpeg', 'image/webp', 'image/avif');

const inputArb = fc.record({ filename: fc.string({ maxLength: 100 }), format: formatArb });

describe('image-format-converter property tests', () => {
  it('never throws for arbitrary filenames/formats', () => {
    neverThrows(({ filename, format }) => replaceExtension(filename, format), inputArb, {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
  });

  it('always ends with the extension matching the requested format', () => {
    invariant(
      ({ filename, format }) => replaceExtension(filename, format),
      inputArb,
      (result, { format }) => result.endsWith('.' + extensionForFormat(format)),
    );
  });
});
