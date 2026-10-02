// The official MessagePack specification documents format families and first-byte
// layouts, but publishes no complete byte-sequence/decoded-value examples. Keep
// round-trip coverage separate; no known-answer vector is claimed in the manifest.
import { encode } from '@msgpack/msgpack';
import { decodeMsgpack } from "./msgpack-decode.js";

describe('decodeMsgpack', () => {
  it('decodes an encoded plain object', () => {
    const bytes = encode({ a: 1, b: 'hello' });

    expect(decodeMsgpack(bytes)).toEqual({ ok: true, value: { a: 1, b: 'hello' } });
  });

  it('decodes an encoded array', () => {
    const bytes = encode([1, 2, 3]);

    expect(decodeMsgpack(bytes)).toEqual({ ok: true, value: [1, 2, 3] });
  });

  it('decodes nested structures', () => {
    const bytes = encode({ list: [{ x: 1 }, { x: 2 }] });

    expect(decodeMsgpack(bytes)).toEqual({ ok: true, value: { list: [{ x: 1 }, { x: 2 }] } });
  });

  it('rejects an empty file', () => {
    expect(decodeMsgpack(new Uint8Array(0)).ok).toBe(false);
  });

  it('reports an error for bytes that are not valid MessagePack', () => {
    const result = decodeMsgpack(new Uint8Array([0xc1]));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });
});
