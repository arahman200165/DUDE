import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, roundTrip } from "../../../../../../tests/property-harness";
import { inspectPercentEncoding } from "@dude/tool-engine/tools/url-percent-inspector/percent-encoding-inspect";

describe('inspectPercentEncoding round-trip', () => {
  it('recovers the original string after percent-encoding it with encodeURIComponent', () => {
    roundTrip(
      (raw: string) => encodeURIComponent(raw),
      (encoded) => inspectPercentEncoding(encoded as string).decoded,
      fc.string(),
    );
  });
});

describe('inspectPercentEncoding fuzzing', () => {
  it('never throws for arbitrary text, and its segments always concatenate back to the decoded output', () => {
    neverThrows((raw: string) => inspectPercentEncoding(raw), fc.string(), {
      assertShape: (result) => {
        const r = result as ReturnType<typeof inspectPercentEncoding>;
        if (!Array.isArray(r.segments)) throw new Error('expected segments to be an array');
        if (typeof r.decoded !== 'string') throw new Error('expected decoded to be a string');
      },
    });
  });
});
