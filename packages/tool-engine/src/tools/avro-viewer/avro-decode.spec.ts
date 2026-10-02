import { decodeAvroContainer } from "./avro-decode.js";

function zigzagEncode(n: number): number {
  return n >= 0 ? n * 2 : -n * 2 - 1;
}

function encodeVarint(n: number): number[] {
  const bytes: number[] = [];
  let value = n;
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  bytes.push(value);
  return bytes;
}

function encodeLong(n: number): number[] {
  return encodeVarint(zigzagEncode(n));
}

function encodeBytesRaw(bytes: readonly number[]): number[] {
  return [...encodeLong(bytes.length), ...bytes];
}

function encodeString(value: string): number[] {
  return encodeBytesRaw(Array.from(new TextEncoder().encode(value)));
}

const SYNC_MARKER = Array.from({ length: 16 }, (_, i) => i);

/** Assembles a minimal valid Avro Object Container File from a schema and pre-encoded record byte arrays. */
function buildAvroFile(schema: unknown, encodedRecords: readonly number[][], codec = 'null'): Uint8Array {
  const metadata = [
    ...encodeLong(2), // 2 key-value pairs
    ...encodeString('avro.schema'),
    ...encodeBytesRaw(Array.from(new TextEncoder().encode(JSON.stringify(schema)))),
    ...encodeString('avro.codec'),
    ...encodeBytesRaw(Array.from(new TextEncoder().encode(codec))),
    ...encodeLong(0), // end of metadata map
  ];

  const recordBytes = encodedRecords.flat();
  const block = [...encodeLong(encodedRecords.length), ...encodeLong(recordBytes.length), ...recordBytes, ...SYNC_MARKER];

  return new Uint8Array([0x4f, 0x62, 0x6a, 0x01, ...metadata, ...SYNC_MARKER, ...block]);
}

describe('decodeAvroContainer', () => {
  it('decodes records for a simple two-field schema', () => {
    const schema = { type: 'record', name: 'User', fields: [{ name: 'name', type: 'string' }, { name: 'age', type: 'int' }] };
    const alice = [...encodeString('Alice'), ...encodeLong(30)];
    const bob = [...encodeString('Bob'), ...encodeLong(25)];
    const file = buildAvroFile(schema, [alice, bob]);

    const result = decodeAvroContainer(file);

    expect(result).toEqual({
      ok: true,
      schema,
      records: [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ],
    });
  });

  it('decodes a nullable union field', () => {
    const schema = { type: 'record', name: 'R', fields: [{ name: 'note', type: ['null', 'string'] }] };
    const withValue = [...encodeLong(1), ...encodeString('hi')]; // branch index 1 = string
    const withNull = [...encodeLong(0)]; // branch index 0 = null
    const file = buildAvroFile(schema, [withValue, withNull]);

    const result = decodeAvroContainer(file);

    expect(result).toEqual({ ok: true, schema, records: [{ note: 'hi' }, { note: null }] });
  });

  it('decodes an array field', () => {
    const schema = { type: 'record', name: 'R', fields: [{ name: 'tags', type: { type: 'array', items: 'string' } }] };
    const record = [...encodeLong(2), ...encodeString('a'), ...encodeString('b'), ...encodeLong(0)];
    const file = buildAvroFile(schema, [record]);

    const result = decodeAvroContainer(file);

    expect(result).toEqual({ ok: true, schema, records: [{ tags: ['a', 'b'] }] });
  });

  it('decodes an enum field', () => {
    const schema = {
      type: 'record',
      name: 'R',
      fields: [{ name: 'suit', type: { type: 'enum', name: 'Suit', symbols: ['CLUBS', 'HEARTS'] } }],
    };
    const record = [...encodeLong(1)]; // index 1 = HEARTS
    const file = buildAvroFile(schema, [record]);

    const result = decodeAvroContainer(file);

    expect(result).toEqual({ ok: true, schema, records: [{ suit: 'HEARTS' }] });
  });

  it('decodes a nested record field', () => {
    const inner = { type: 'record', name: 'Inner', fields: [{ name: 'x', type: 'int' }] };
    const schema = { type: 'record', name: 'Outer', fields: [{ name: 'inner', type: inner }] };
    const record = [...encodeLong(7)];
    const file = buildAvroFile(schema, [record]);

    const result = decodeAvroContainer(file);

    expect(result).toEqual({ ok: true, schema, records: [{ inner: { x: 7 } }] });
  });

  it('rejects an empty file', () => {
    expect(decodeAvroContainer(new Uint8Array(0)).ok).toBe(false);
  });

  it('rejects a file with the wrong magic bytes', () => {
    const result = decodeAvroContainer(new Uint8Array([1, 2, 3, 4, 5]));

    expect(result).toEqual({ ok: false, error: { message: 'Not an Avro Object Container File (bad magic bytes).' } });
  });

  it('rejects a compressed file with a clear error naming the codec', () => {
    const schema = { type: 'record', name: 'R', fields: [{ name: 'x', type: 'int' }] };
    const file = buildAvroFile(schema, [encodeLong(1)], 'deflate');

    const result = decodeAvroContainer(file);

    expect(result).toEqual({
      ok: false,
      error: { message: 'Unsupported codec "deflate" — only uncompressed ("null" codec) Avro files are supported.' },
    });
  });
});
