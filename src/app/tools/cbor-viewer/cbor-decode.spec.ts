import { encode } from 'cbor-x';
import { decodeCbor } from './cbor-decode';

describe('decodeCbor', () => {
  it('passes literal RFC 8949 Appendix A diagnostic examples', () => {
    expect(decodeCbor(Uint8Array.of(0x00))).toEqual({ ok: true, value: 0 });
    expect(decodeCbor(Uint8Array.of(0x18, 0x18))).toEqual({ ok: true, value: 24 });
    expect(decodeCbor(Uint8Array.of(0x83, 0x01, 0x02, 0x03))).toEqual({ ok: true, value: [1, 2, 3] });
    expect(decodeCbor(Uint8Array.of(0xa2, 0x01, 0x02, 0x03, 0x04))).toEqual({ ok: true, value: { '1': 2, '3': 4 } });
    expect(decodeCbor(Uint8Array.of(0x82, 0x61, 0x61, 0xa1, 0x61, 0x62, 0x61, 0x63))).toEqual({
      ok: true,
      value: ['a', { b: 'c' }],
    });
  });
  it('decodes an encoded plain object', () => {
    const bytes = encode({ a: 1, b: 'hello' });

    expect(decodeCbor(bytes)).toEqual({ ok: true, value: { a: 1, b: 'hello' } });
  });

  it('decodes an encoded array', () => {
    const bytes = encode([1, 2, 3]);

    expect(decodeCbor(bytes)).toEqual({ ok: true, value: [1, 2, 3] });
  });

  it('decodes a Date as a Date instance', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const bytes = encode({ d: date });

    const result = decodeCbor(bytes);
    expect(result.ok).toBe(true);
    expect(result.ok && (result.value as { d: Date }).d).toEqual(date);
  });

  it('decodes nested structures', () => {
    const bytes = encode({ list: [{ x: 1 }, { x: 2 }] });

    expect(decodeCbor(bytes)).toEqual({ ok: true, value: { list: [{ x: 1 }, { x: 2 }] } });
  });

  it('rejects an empty file', () => {
    expect(decodeCbor(new Uint8Array(0)).ok).toBe(false);
  });

  it('reports an error for bytes that are not valid CBOR', () => {
    const result = decodeCbor(new Uint8Array([0xff, 0xff]));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });
});
