import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, roundTrip } from "../../../../../../tests/property-harness";
import { chunkIntoRows, formatHexByte, parseHexByte, setByteAt } from "@dude/tool-engine/tools/hex-editor/hex-editor-logic";

describe('hex editor properties', () => {
  it('round-trips byte values through hexadecimal formatting', () => {
    roundTrip(formatHexByte, (encoded) => parseHexByte(String(encoded))!, fc.integer({ min: 0, max: 255 }));
  });

  it('changes exactly one in-range byte and chunks preserve byte order', () => {
    invariant(([source, index, value, width]) => ({ source, index, value, width }), fc.tuple(fc.uint8Array({ minLength: 1, maxLength: 256 }), fc.nat(), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 1, max: 32 })), ({ source, index: rawIndex, value, width }) => {
      const index = rawIndex % source.length;
      const updated = setByteAt(source, index, value);
      expect(updated[index]).toBe(value);
      expect(updated.filter((byte, i) => i !== index)).toEqual(source.filter((_, i) => i !== index));
      return chunkIntoRows(updated, width).flatMap((row) => row.bytes).join(',') === Array.from(updated).join(',');
    });
  });
});
