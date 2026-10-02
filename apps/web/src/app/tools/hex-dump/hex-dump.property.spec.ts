import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, roundTrip } from "../../../../../../tests/property-harness";
import { formatHexDump, parseHexDump } from "@dude/tool-engine/tools/hex-dump/hex-dump-codec";

describe('formatHexDump / parseHexDump round-trip property', () => {
  it('parseHexDump(formatHexDump(bytes)) recovers the original bytes for arbitrary binary input', () => {
    roundTrip(
      (bytes: number[]) => formatHexDump(Uint8Array.from(bytes)),
      (dump) => {
        const result = parseHexDump(dump as string);
        if (!result.ok) throw new Error('expected our own hex dump output to parse');
        return Array.from(result.value);
      },
      fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 200 }),
    );
  });
});

describe('fuzzing', () => {
  it('parseHexDump never throws for arbitrary text input', () => {
    neverThrows((text: string) => parseHexDump(text), fc.string());
  });
});
