import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { filterEntityTable, HTML_ENTITY_TABLE } from './html-entity-explorer-logic';

describe('filterEntityTable property', () => {
  it('finds each generated table entry by name, character, decimal, and hex query', () => {
    invariant(
      (entry) => [entry.name, entry.name.toUpperCase(), entry.char, String(entry.decimal), entry.hex],
      fc.constantFrom(...HTML_ENTITY_TABLE),
      (queries, entry) => queries.every((query) => filterEntityTable(HTML_ENTITY_TABLE, query).some((match) => match.name === entry.name)),
    );
  });

  it('returns only typed table entries for arbitrary search text', () => {
    neverThrows((query: string) => filterEntityTable(HTML_ENTITY_TABLE, query), fc.string(), {
      assertShape: (result) => {
        expect(Array.isArray(result)).toBe(true);
        for (const entry of result as typeof HTML_ENTITY_TABLE) {
          expect(entry).toMatchObject({ name: expect.any(String), char: expect.any(String), decimal: expect.any(Number), hex: expect.any(String) });
        }
      },
    });
  });
});
