import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { generateMockData, parseSchema } from "@dude/tool-engine/tools/mock-data-studio/mock-data-schema";

describe('mock data properties', () => {
  it('never throws while parsing arbitrary schema text', () => {
    neverThrows(parseSchema, fc.string(), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
  it('generates the requested number of rows with schema keys', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 20 }), (rowCount) => {
      const result = generateMockData({ label: 'word.noun' }, { rowCount, seed: 42 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.rows).toHaveLength(rowCount);
        expect(result.rows.every((row) => Object.keys(row).includes('label'))).toBe(true);
      }
    }));
  });
});
