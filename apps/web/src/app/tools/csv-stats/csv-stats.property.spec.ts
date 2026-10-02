import fc from 'fast-check';
import { neverThrows } from "../../../../../../tests/property-harness";
import { computeCsvStats } from "@dude/tool-engine/tools/csv-stats/csv-stats-compute";

describe('computeCsvStats properties', () => {
  it('returns a result for arbitrary CSV text', () => {
    neverThrows(computeCsvStats, fc.string());
  });
});
