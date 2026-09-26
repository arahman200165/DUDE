import fc from 'fast-check';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { extractStringsReport } from './binary-strings-extractor-logic';

describe('extractStringsReport properties', () => {
  const bytes = fc.uint8Array({ maxLength: 512 });
  const options = fc.record({ minLength: fc.integer({ min: 1, max: 20 }), includeAscii: fc.boolean(), includeUtf16Le: fc.boolean() });

  it('never throws and reports bounded, offset-ordered results', () => {
    neverThrows(([input, opts]: [Uint8Array, { minLength: number; includeAscii: boolean; includeUtf16Le: boolean }]) => extractStringsReport(input, opts), fc.tuple(bytes, options), {
      assertShape: (result) => expect((result as ReturnType<typeof extractStringsReport>).strings.length).toBeLessThanOrEqual(5000),
    });
    invariant(([input, opts]) => extractStringsReport(input, opts), fc.tuple(bytes, options), (report) => report.byteLength >= 0 && report.strings.every((s, i, all) => i === 0 || all[i - 1].offset <= s.offset));
  });
});
