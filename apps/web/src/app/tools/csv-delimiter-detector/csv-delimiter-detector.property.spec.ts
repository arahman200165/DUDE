import fc from 'fast-check';
import { neverThrows } from "../../../../../../tests/property-harness";
import { detectCsvDelimiter } from "@dude/tool-engine/tools/csv-delimiter-detector/csv-delimiter-detect";

describe('detectCsvDelimiter properties', () => {
  it('returns a structured result for arbitrary text', () => {
    neverThrows(detectCsvDelimiter, fc.string());
  });
});
