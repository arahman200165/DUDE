import fc from 'fast-check';
import { neverThrows } from '../../../testing/property-harness';
import { decodeBson } from './bson-decode';

describe('decodeBson properties', () => {
  it('returns a structured result for arbitrary bytes', () => {
    neverThrows((bytes) => decodeBson(Uint8Array.from(bytes)), fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 256 }));
  });
});
