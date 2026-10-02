import { dataViewOf, Endianness, readFixedString, readFloat32, readFloat64, readInt16, readInt32, readInt64, readInt8, readUint16, readUint32, readUint64, readUint8 } from "../../shared/utils/struct-reader.js";

export type StructFieldType = 'uint8' | 'int8' | 'uint16' | 'int16' | 'uint32' | 'int32' | 'uint64' | 'int64' | 'float32' | 'float64' | 'char';

export interface StructFieldDef {
  readonly name: string;
  readonly type: StructFieldType;
  /** Only meaningful for `char` -- the number of bytes the fixed-width string occupies. */
  readonly length: number;
  readonly endianness: Endianness;
}

export interface ParsedField {
  readonly name: string;
  readonly type: StructFieldType;
  readonly offset: number;
  readonly size: number;
  readonly value: string;
}

export interface StructParseResult {
  readonly fields: readonly ParsedField[];
  readonly bytesConsumed: number;
  readonly error: string | null;
}

const FIXED_SIZES: Partial<Record<StructFieldType, number>> = {
  uint8: 1,
  int8: 1,
  uint16: 2,
  int16: 2,
  uint32: 4,
  int32: 4,
  uint64: 8,
  int64: 8,
  float32: 4,
  float64: 8,
};

export function sizeOfField(field: StructFieldDef): number {
  return field.type === 'char' ? Math.max(0, field.length) : (FIXED_SIZES[field.type] ?? 0);
}

export function parseStruct(bytes: Uint8Array, fields: readonly StructFieldDef[]): StructParseResult {
  const view = dataViewOf(bytes);
  const parsed: ParsedField[] = [];
  let offset = 0;

  for (const field of fields) {
    const size = sizeOfField(field);
    try {
      const value = readFieldValue(bytes, view, field, offset);
      parsed.push({ name: field.name, type: field.type, offset, size, value });
      offset += size;
    } catch {
      return { fields: parsed, bytesConsumed: offset, error: `Ran out of bytes reading "${field.name}" at offset ${offset}.` };
    }
  }

  return { fields: parsed, bytesConsumed: offset, error: null };
}

function readFieldValue(bytes: Uint8Array, view: DataView, field: StructFieldDef, offset: number): string {
  switch (field.type) {
    case 'uint8':
      return String(readUint8(view, offset));
    case 'int8':
      return String(readInt8(view, offset));
    case 'uint16':
      return String(readUint16(view, offset, field.endianness));
    case 'int16':
      return String(readInt16(view, offset, field.endianness));
    case 'uint32':
      return String(readUint32(view, offset, field.endianness));
    case 'int32':
      return String(readInt32(view, offset, field.endianness));
    case 'uint64':
      return readUint64(view, offset, field.endianness).toString();
    case 'int64':
      return readInt64(view, offset, field.endianness).toString();
    case 'float32':
      return String(readFloat32(view, offset, field.endianness));
    case 'float64':
      return String(readFloat64(view, offset, field.endianness));
    case 'char':
      return readFixedString(bytes, offset, field.length);
  }
}
