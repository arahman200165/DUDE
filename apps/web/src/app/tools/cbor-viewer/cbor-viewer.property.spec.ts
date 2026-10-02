import fc from 'fast-check';
import { neverThrows } from "../../../../../../tests/property-harness";
import { decodeCbor } from "@dude/tool-engine/tools/cbor-viewer/cbor-decode";

describe('decodeCbor properties', () => {
  it('returns a structured result for arbitrary bytes', () => {
    neverThrows((bytes) => decodeCbor(Uint8Array.from(bytes)), fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 256 }));
  });
});
