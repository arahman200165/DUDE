import fc from 'fast-check';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { dedupeCsv } from "@dude/tool-engine/tools/csv-dedupe/csv-dedupe-transform";

describe('dedupeCsv properties', () => {
  it('returns a result for arbitrary text and keys', () => {
    neverThrows(([input, keys]) => dedupeCsv(input, keys), fc.tuple(fc.string(), fc.string()));
  });
  it('removes duplicate rows and is idempotent', () => {
    invariant((input) => {
      const result = dedupeCsv(input, '');
      if (!result.ok) return true;
      const again = dedupeCsv(result.output, '');
      return again.ok && again.output === result.output;
    }, fc.array(fc.tuple(fc.stringMatching(/^[a-z]{1,6}$/), fc.integer({ min: -100, max: 100 }).map(String)), { minLength: 1, maxLength: 12 })
      .map((rows) => ['name,n', ...rows.map((row) => row.join(','))].join('\n')), Boolean);
  });
});
