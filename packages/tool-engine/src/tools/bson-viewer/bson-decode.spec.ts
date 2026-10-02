import { ObjectId, serialize } from 'bson';
import { decodeBson } from "./bson-decode.js";

describe('decodeBson', () => {
  it('decodes a serialized document', () => {
    const bytes = serialize({ a: 1, b: 'hello' });

    expect(decodeBson(bytes)).toEqual({ ok: true, value: { a: 1, b: 'hello' } });
  });

  it('decodes an ObjectId into its Extended JSON form', () => {
    const id = new ObjectId('507f1f77bcf86cd799439011');
    const bytes = serialize({ _id: id });

    expect(decodeBson(bytes)).toEqual({ ok: true, value: { _id: { $oid: '507f1f77bcf86cd799439011' } } });
  });

  it('decodes a Date into its Extended JSON form', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const bytes = serialize({ createdAt: date });

    const result = decodeBson(bytes);
    expect(result).toEqual({ ok: true, value: { createdAt: { $date: '2024-01-01T00:00:00Z' } } });
  });

  it('decodes nested documents and arrays', () => {
    const bytes = serialize({ list: [{ x: 1 }, { x: 2 }] });

    expect(decodeBson(bytes)).toEqual({ ok: true, value: { list: [{ x: 1 }, { x: 2 }] } });
  });

  it('rejects an empty file', () => {
    expect(decodeBson(new Uint8Array(0)).ok).toBe(false);
  });

  it('reports an error for bytes that are not valid BSON', () => {
    const result = decodeBson(new Uint8Array([1, 2, 3]));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });
});
