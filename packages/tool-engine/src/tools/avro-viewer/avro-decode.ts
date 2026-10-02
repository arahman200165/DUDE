/**
 * Pure, framework-free Avro Object Container File decoding used by the Avro
 * Viewer tool.
 *
 * Hand-rolled rather than using a library: `avsc` (the natural choice) turns
 * out to require Node built-ins (`stream`, `util`, `path`) even in its
 * "browser" build, which fails to bundle without extra polyfill
 * configuration this repo doesn't otherwise need. The Avro binary encoding
 * itself is a small, precisely-specified, mechanical format (zigzag varints,
 * length-prefixed strings, block-iterated arrays/maps, schema-ordered
 * record fields) — well inside the bar for hand-rolling rather than reaching
 * for a dependency. Scope: only the uncompressed ("null" codec) case, which
 * covers the common case; a compressed file reports a clear error naming
 * the codec instead of silently failing. Logical types (decimal, date,
 * timestamp-*, ...) are not specially interpreted — their underlying
 * primitive value is shown as-is.
 */

export type AvroSchema = string | AvroSchema[] | { readonly type: string; readonly [key: string]: unknown };

export interface AvroDecodeError {
  readonly message: string;
}

export type AvroDecodeResult =
  | { readonly ok: true; readonly schema: AvroSchema; readonly records: readonly unknown[] }
  | { readonly ok: false; readonly error: AvroDecodeError };

interface Decoded<T> {
  readonly value: T;
  readonly offset: number;
}

function decodeVarint(buf: Uint8Array, offset: number): Decoded<number> {
  let result = 0;
  let multiplier = 1;
  let pos = offset;
  for (;;) {
    if (pos >= buf.length) throw new Error('Unexpected end of data while reading a varint.');
    const byte = buf[pos];
    pos++;
    result += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) break;
    multiplier *= 128;
  }
  return { value: result, offset: pos };
}

function zigzagDecode(raw: number): number {
  return raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
}

function decodeLong(buf: Uint8Array, offset: number): Decoded<number> {
  const raw = decodeVarint(buf, offset);
  return { value: zigzagDecode(raw.value), offset: raw.offset };
}

function decodeBoolean(buf: Uint8Array, offset: number): Decoded<boolean> {
  return { value: buf[offset] !== 0, offset: offset + 1 };
}

function decodeFloat(buf: Uint8Array, offset: number): Decoded<number> {
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 4);
  return { value: view.getFloat32(0, true), offset: offset + 4 };
}

function decodeDouble(buf: Uint8Array, offset: number): Decoded<number> {
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 8);
  return { value: view.getFloat64(0, true), offset: offset + 8 };
}

function decodeBytesRaw(buf: Uint8Array, offset: number): Decoded<Uint8Array> {
  const length = decodeLong(buf, offset);
  const end = length.offset + length.value;
  return { value: buf.subarray(length.offset, end), offset: end };
}

function decodeString(buf: Uint8Array, offset: number): Decoded<string> {
  const bytes = decodeBytesRaw(buf, offset);
  return { value: new TextDecoder('utf-8').decode(bytes.value), offset: bytes.offset };
}

/** Iterates Avro's block-encoded array/map format (a run of items, `0`-terminated; a negative count is followed by a byte-size to skip). */
function decodeBlocks<T>(buf: Uint8Array, offset: number, decodeItem: (buf: Uint8Array, offset: number) => Decoded<T>): Decoded<T[]> {
  const items: T[] = [];
  let pos = offset;
  for (;;) {
    const count = decodeLong(buf, pos);
    pos = count.offset;
    if (count.value === 0) break;

    let remaining = count.value;
    if (remaining < 0) {
      const size = decodeLong(buf, pos);
      pos = size.offset;
      remaining = -remaining;
    }

    for (let i = 0; i < remaining; i++) {
      const item = decodeItem(buf, pos);
      items.push(item.value);
      pos = item.offset;
    }
  }
  return { value: items, offset: pos };
}

function decodeMetadataMap(buf: Uint8Array, offset: number): Decoded<Record<string, Uint8Array>> {
  const entries = decodeBlocks(buf, offset, (b, o) => {
    const key = decodeString(b, o);
    const value = decodeBytesRaw(b, key.offset);
    return { value: [key.value, value.value] as const, offset: value.offset };
  });
  return { value: Object.fromEntries(entries.value), offset: entries.offset };
}

type NamedTypeRegistry = Map<string, AvroSchema>;

function decodeAvroValue(schema: AvroSchema, buf: Uint8Array, offset: number, registry: NamedTypeRegistry): Decoded<unknown> {
  if (Array.isArray(schema)) {
    const index = decodeLong(buf, offset);
    const branch = schema[index.value];
    if (branch === undefined) throw new Error(`Union index ${index.value} has no matching branch.`);
    return decodeAvroValue(branch, buf, index.offset, registry);
  }

  if (typeof schema === 'string') {
    switch (schema) {
      case 'null':
        return { value: null, offset };
      case 'boolean':
        return decodeBoolean(buf, offset);
      case 'int':
      case 'long':
        return decodeLong(buf, offset);
      case 'float':
        return decodeFloat(buf, offset);
      case 'double':
        return decodeDouble(buf, offset);
      case 'bytes':
        return decodeBytesRaw(buf, offset);
      case 'string':
        return decodeString(buf, offset);
      default: {
        const resolved = registry.get(schema);
        if (!resolved) throw new Error(`Unknown named Avro type "${schema}".`);
        return decodeAvroValue(resolved, buf, offset, registry);
      }
    }
  }

  const type = schema.type;

  if (type === 'record') {
    const name = schema['name'] as string | undefined;
    if (name) registry.set(name, schema);
    const fields = schema['fields'] as readonly { readonly name: string; readonly type: AvroSchema }[];
    const value: Record<string, unknown> = {};
    let pos = offset;
    for (const field of fields) {
      const decoded = decodeAvroValue(field.type, buf, pos, registry);
      value[field.name] = decoded.value;
      pos = decoded.offset;
    }
    return { value, offset: pos };
  }

  if (type === 'enum') {
    const name = schema['name'] as string | undefined;
    if (name) registry.set(name, schema);
    const symbols = schema['symbols'] as readonly string[];
    const index = decodeLong(buf, offset);
    return { value: symbols[index.value], offset: index.offset };
  }

  if (type === 'array') {
    return decodeBlocks(buf, offset, (b, o) => decodeAvroValue(schema['items'] as AvroSchema, b, o, registry));
  }

  if (type === 'map') {
    const entries = decodeBlocks(buf, offset, (b, o) => {
      const key = decodeString(b, o);
      const value = decodeAvroValue(schema['values'] as AvroSchema, b, key.offset, registry);
      return { value: [key.value, value.value] as const, offset: value.offset };
    });
    return { value: Object.fromEntries(entries.value), offset: entries.offset };
  }

  if (type === 'fixed') {
    const name = schema['name'] as string | undefined;
    if (name) registry.set(name, schema);
    const size = schema['size'] as number;
    return { value: buf.subarray(offset, offset + size), offset: offset + size };
  }

  return decodeAvroValue(type, buf, offset, registry);
}

const MAGIC = [0x4f, 0x62, 0x6a, 0x01];

export function decodeAvroContainer(bytes: Uint8Array): AvroDecodeResult {
  if (bytes.byteLength === 0) return { ok: false, error: { message: 'The file is empty.' } };
  if (bytes.length < 4 || !MAGIC.every((byte, index) => bytes[index] === byte)) {
    return { ok: false, error: { message: 'Not an Avro Object Container File (bad magic bytes).' } };
  }

  try {
    const meta = decodeMetadataMap(bytes, 4);
    const schemaBytes = meta.value['avro.schema'];
    if (!schemaBytes) return { ok: false, error: { message: 'Missing "avro.schema" metadata.' } };

    const codec = meta.value['avro.codec'] ? new TextDecoder('utf-8').decode(meta.value['avro.codec']) : 'null';
    if (codec !== 'null') {
      return {
        ok: false,
        error: { message: `Unsupported codec "${codec}" — only uncompressed ("null" codec) Avro files are supported.` },
      };
    }

    const schema = JSON.parse(new TextDecoder('utf-8').decode(schemaBytes)) as AvroSchema;
    const registry: NamedTypeRegistry = new Map();
    const records: unknown[] = [];
    let offset = meta.offset + 16; // skip the 16-byte sync marker

    while (offset < bytes.length) {
      const count = decodeLong(bytes, offset);
      const size = decodeLong(bytes, count.offset);
      let pos = size.offset;
      for (let i = 0; i < count.value; i++) {
        const record = decodeAvroValue(schema, bytes, pos, registry);
        records.push(record.value);
        pos = record.offset;
      }
      offset = pos + 16; // skip the trailing sync marker
    }

    return { ok: true, schema, records };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
