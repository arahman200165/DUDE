import fc from 'fast-check';
import { neverThrows } from '../../../testing/property-harness';
import { filterSortCsv } from './csv-filter-sort-transform';

describe('filterSortCsv properties', () => {
  it('returns a result for arbitrary text and valid options', () => {
    neverThrows(([input, filterValue]) => filterSortCsv(input, '', 'contains', filterValue, '', 'asc'), fc.tuple(fc.string(), fc.string()));
  });
});
