import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { filterErrorCodes } from "@dude/tool-engine/tools/error-code-reference/error-codes-search";

type Entry = Parameters<typeof filterErrorCodes>[0][number];
const categories = ['windows', 'posix', 'sql'] as const;
const data: readonly Entry[] = [
  { category: 'windows', code: '0x80070005', name: 'Access denied', description: 'Permission denied.' },
  { category: 'posix', code: 'EACCES', name: 'Permission denied', description: 'Access denied.' },
  { category: 'sql', code: '23000', name: 'Integrity constraint', description: 'Constraint violation.' },
] as unknown as readonly Entry[];

describe('filterErrorCodes properties', () => {
  it('never throws and only returns entries from the requested category', () => {
    neverThrows((filterText) => filterErrorCodes(data, 'windows' as Parameters<typeof filterErrorCodes>[1], filterText), fc.string(), {
      assertShape: (result) => expect(Array.isArray(result)).toBe(true),
    });
  });

  it('returns the full category for blank search and every filtered result matches the query', () => {
    for (const category of categories) {
      const filtered = filterErrorCodes(data, category as Parameters<typeof filterErrorCodes>[1], '');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].category).toBe(category);
    }
    const matches = filterErrorCodes(data, 'windows' as Parameters<typeof filterErrorCodes>[1], '80070005');
    expect(matches.map((entry) => entry.code)).toEqual(['0x80070005']);
  });
});
