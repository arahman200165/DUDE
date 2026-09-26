import fc from 'fast-check';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { detectBom, stripBom } from '../../shared/utils/encoding-detection';

describe('BOM detection properties', () => {
  it('never throws and stripping never grows a byte array', () => {
    const bytes = fc.uint8Array({ maxLength: 256 });
    neverThrows(stripBom, bytes, { assertShape: (result) => expect(result).toBeInstanceOf(Uint8Array) });
    invariant(stripBom, bytes, (stripped, original) => stripped.length <= original.length);
    neverThrows(detectBom, bytes, { assertShape: (result) => expect(result === null || Boolean(result && (result as { length: number }).length > 0)).toBe(true) });
  });
});

