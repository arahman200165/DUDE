import fc from 'fast-check';
import { neverThrows } from "../../../../../../tests/property-harness";
import { pivotCsv } from "@dude/tool-engine/tools/csv-pivot/csv-pivot-transform";

describe('pivotCsv properties', () => {
  it('returns a result for arbitrary text and aggregation', () => {
    neverThrows(([input, aggregation]) => pivotCsv(input, 'r', 'c', 'v', aggregation),
      fc.tuple(fc.string(), fc.constantFrom('sum' as const, 'count' as const, 'avg' as const)));
  });
});
