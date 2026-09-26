import fc from 'fast-check';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { joinCsv } from './csv-join-transform';

describe('joinCsv properties', () => {
  it('returns a result for arbitrary inputs', () => {
    neverThrows(([left, right]) => joinCsv(left, right, 'id', 'id', 'left'), fc.tuple(fc.string(), fc.string()));
  });
  it('left join preserves all rows from a generated left table', () => {
    invariant((count) => {
      const left = ['id,value', ...Array.from({ length: count }, (_, i) => `${i},left${i}`)].join('\n');
      const result = joinCsv(left, 'id,extra\n0,x', 'id', 'id', 'left');
      return result.ok && result.table.rows.length === count;
    }, fc.integer({ min: 1, max: 20 }), Boolean);
  });
});
