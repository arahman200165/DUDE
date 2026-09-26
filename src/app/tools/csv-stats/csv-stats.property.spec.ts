import fc from 'fast-check';
import { neverThrows } from '../../../testing/property-harness';
import { computeCsvStats } from './csv-stats-compute';

describe('computeCsvStats properties', () => {
  it('returns a result for arbitrary CSV text', () => {
    neverThrows(computeCsvStats, fc.string());
  });
});
