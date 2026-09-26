import fc from 'fast-check';
import { neverThrows } from '../../../testing/property-harness';
import { decodeCbor } from './cbor-decode';

describe('decodeCbor properties', () => {
  it('returns a structured result for arbitrary bytes', () => {
    neverThrows((bytes) => decodeCbor(Uint8Array.from(bytes)), fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 256 }));
  });
});
