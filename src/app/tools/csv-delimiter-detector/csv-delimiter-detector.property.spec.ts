import fc from 'fast-check';
import { neverThrows } from '../../../testing/property-harness';
import { detectCsvDelimiter } from './csv-delimiter-detect';

describe('detectCsvDelimiter properties', () => {
  it('returns a structured result for arbitrary text', () => {
    neverThrows(detectCsvDelimiter, fc.string());
  });
});
