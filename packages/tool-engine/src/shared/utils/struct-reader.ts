/**
 * Endianness-aware primitives for reading fixed-width binary structures out
 * of an offset into a byte buffer. Shared foundation for the Binary
 * Structure Inspector (a user-defined field list) and the PE/ELF/Mach-O
 * header viewers (fixed, well-known field lists) -- all of them are "read a
 * struct's fields out of a DataView at known offsets", just with a
 * different source for the field list.
 *
 * Every primitive here delegates bounds-checking to DataView itself (it
 * throws a RangeError for an out-of-range offset), so callers catch once
 * around a whole struct-read rather than each field needing its own check.
 */

export type Endianness = 'LE' | 'BE';

export function readUint8(view: DataView, offset: number): number {
  return view.getUint8(offset);
}

export function readInt8(view: DataView, offset: number): number {
  return view.getInt8(offset);
}

export function readUint16(view: DataView, offset: number, endianness: Endianness): number {
  return view.getUint16(offset, endianness === 'LE');
}

export function readInt16(view: DataView, offset: number, endianness: Endianness): number {
  return view.getInt16(offset, endianness === 'LE');
}

export function readUint32(view: DataView, offset: number, endianness: Endianness): number {
  return view.getUint32(offset, endianness === 'LE');
}

export function readInt32(view: DataView, offset: number, endianness: Endianness): number {
  return view.getInt32(offset, endianness === 'LE');
}

export function readUint64(view: DataView, offset: number, endianness: Endianness): bigint {
  return view.getBigUint64(offset, endianness === 'LE');
}

export function readInt64(view: DataView, offset: number, endianness: Endianness): bigint {
  return view.getBigInt64(offset, endianness === 'LE');
}

export function readFloat32(view: DataView, offset: number, endianness: Endianness): number {
  return view.getFloat32(offset, endianness === 'LE');
}

export function readFloat64(view: DataView, offset: number, endianness: Endianness): number {
  return view.getFloat64(offset, endianness === 'LE');
}

/** Reads `length` bytes as ASCII/Latin-1 text, trimming trailing NUL padding (the common C-string-in-a-fixed-field convention). */
export function readFixedString(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) throw new RangeError('readFixedString: offset out of range.');

  let end = offset + length;
  while (end > offset && bytes[end - 1] === 0) end--;

  let out = '';
  for (let i = offset; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

export function dataViewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
