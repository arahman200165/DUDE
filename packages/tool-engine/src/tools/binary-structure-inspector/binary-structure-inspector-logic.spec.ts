import { parseStruct, sizeOfField, StructFieldDef } from "./binary-structure-inspector-logic.js";

function field(overrides: Partial<StructFieldDef>): StructFieldDef {
  return { name: 'field', type: 'uint8', length: 0, endianness: 'LE', ...overrides };
}

describe('sizeOfField', () => {
  it('returns the fixed size for numeric types', () => {
    expect(sizeOfField(field({ type: 'uint32' }))).toBe(4);
    expect(sizeOfField(field({ type: 'int64' }))).toBe(8);
  });

  it('returns the declared length for a char field', () => {
    expect(sizeOfField(field({ type: 'char', length: 12 }))).toBe(12);
  });
});

describe('parseStruct', () => {
  it('parses a sequence of fields at increasing offsets', () => {
    const bytes = new Uint8Array([0x2a, 0x34, 0x12, 0x41, 0x42, 0x00, 0x00]);
    const fields: StructFieldDef[] = [
      field({ name: 'magic', type: 'uint8' }),
      field({ name: 'version', type: 'uint16', endianness: 'LE' }),
      field({ name: 'label', type: 'char', length: 4 }),
    ];
    const result = parseStruct(bytes, fields);

    expect(result.error).toBeNull();
    expect(result.fields).toEqual([
      { name: 'magic', type: 'uint8', offset: 0, size: 1, value: '42' },
      { name: 'version', type: 'uint16', offset: 1, size: 2, value: '4660' },
      { name: 'label', type: 'char', offset: 3, size: 4, value: 'AB' },
    ]);
    expect(result.bytesConsumed).toBe(7);
  });

  it('reports an error and the fields parsed so far when a field runs past the end of the buffer', () => {
    const bytes = new Uint8Array([0x01]);
    const fields: StructFieldDef[] = [field({ name: 'a', type: 'uint8' }), field({ name: 'b', type: 'uint32' })];
    const result = parseStruct(bytes, fields);

    expect(result.fields).toHaveLength(1);
    expect(result.error).toMatch(/"b"/);
  });

  it('returns no fields and no error for an empty field list', () => {
    const result = parseStruct(new Uint8Array([1, 2, 3]), []);
    expect(result.fields).toEqual([]);
    expect(result.error).toBeNull();
  });
});
