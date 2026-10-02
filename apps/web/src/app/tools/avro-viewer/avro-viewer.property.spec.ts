import fc from 'fast-check';
import { neverThrows } from "../../../../../../tests/property-harness";
import { decodeAvroContainer } from "@dude/tool-engine/tools/avro-viewer/avro-decode";

describe('decodeAvroContainer properties', () => {
  it('returns a structured result for arbitrary bytes', () => {
    neverThrows((bytes) => decodeAvroContainer(Uint8Array.from(bytes)), fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 256 }), {
      assertShape: (result) => expect(typeof result).toBe('object'),
    });
  });
});
