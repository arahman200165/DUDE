import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { ASCII_TABLE } from './ascii-table-data';
import { filterAsciiTable } from './ascii-table-search';

describe('filterAsciiTable fuzzing', () => {
  it('never throws for arbitrary filter text', () => {
    neverThrows((filterText: string) => filterAsciiTable(ASCII_TABLE, filterText), fc.string());
  });

  it('every returned row is one of the 128 known entries and actually matches the filter', () => {
    invariant(
      (filterText: string) => filterAsciiTable(ASCII_TABLE, filterText),
      fc.string(),
      (results, filterText) => {
        const normalized = filterText.trim().toLowerCase();
        return results.every(
          (entry) =>
            ASCII_TABLE.includes(entry) &&
            (normalized === '' ||
              entry.decimal.toString().includes(normalized) ||
              entry.hex.toLowerCase().includes(normalized) ||
              entry.octal.includes(normalized) ||
              entry.char.toLowerCase().includes(normalized) ||
              entry.name.toLowerCase().includes(normalized)),
        );
      },
    );
  });

  it('an empty (or whitespace-only) filter returns every row', () => {
    invariant(
      (filterText: string) => filterAsciiTable(ASCII_TABLE, filterText),
      fc.stringMatching(/^\s*$/),
      (results) => results.length === ASCII_TABLE.length,
    );
  });
});
