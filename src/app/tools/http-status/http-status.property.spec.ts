import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { filterHttpStatusCodes } from './http-status-search';
import { HttpStatusCategory, HttpStatusEntry } from '../../shared/utils/http-status-codes';

const CATEGORIES: readonly HttpStatusCategory[] = [
  '1xx Informational',
  '2xx Success',
  '3xx Redirection',
  '4xx Client Error',
  '5xx Server Error',
];

const entryArb: fc.Arbitrary<HttpStatusEntry> = fc.record({
  code: fc.integer({ min: 100, max: 599 }),
  name: fc.string(),
  description: fc.string(),
  category: fc.constantFrom(...CATEGORIES),
});
const dataArb = fc.array(entryArb, { maxLength: 20 });

describe('filterHttpStatusCodes fuzzing', () => {
  it('never throws for arbitrary data/filter text', () => {
    neverThrows(
      (input: { data: readonly HttpStatusEntry[]; filterText: string }) =>
        filterHttpStatusCodes(input.data, input.filterText),
      fc.record({ data: dataArb, filterText: fc.string() }),
      {
        assertShape: (result) => {
          if (!Array.isArray(result)) throw new Error('expected an array of groups');
        },
      },
    );
  });

  it('an empty filter returns every entry, partitioned by category and sorted by code within each group', () => {
    invariant(
      (data: readonly HttpStatusEntry[]) => filterHttpStatusCodes(data, ''),
      dataArb,
      (groups, data) => {
        const totalReturned = groups.reduce((sum, g) => sum + g.entries.length, 0);
        if (totalReturned !== data.length) return false;
        for (const group of groups) {
          if (group.entries.length === 0) return false; // empty groups are filtered out
          if (group.entries.some((e) => e.category !== group.category)) return false;
          for (let i = 0; i < group.entries.length - 1; i++) {
            if (group.entries[i].code > group.entries[i + 1].code) return false;
          }
        }
        return true;
      },
    );
  });

  it('a non-empty filter only returns entries whose code, name, or description contains it (case-insensitively)', () => {
    invariant(
      (input: { data: readonly HttpStatusEntry[]; filterText: string }) =>
        filterHttpStatusCodes(input.data, input.filterText),
      fc.record({ data: dataArb, filterText: fc.string({ minLength: 1 }).filter((s) => s.trim() !== '') }),
      (groups, input) => {
        const normalized = input.filterText.trim().toLowerCase();
        return groups.every((group) =>
          group.entries.every(
            (entry) =>
              entry.code.toString().includes(normalized) ||
              entry.name.toLowerCase().includes(normalized) ||
              entry.description.toLowerCase().includes(normalized),
          ),
        );
      },
    );
  });
});
