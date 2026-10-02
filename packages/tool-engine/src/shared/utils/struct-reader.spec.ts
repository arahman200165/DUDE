import {
  dataViewOf,
  readFixedString,
  readFloat32,
  readFloat64,
  readInt16,
  readInt32,
  readInt64,
  readInt8,
  readUint16,
  readUint32,
  readUint64,
  readUint8,
} from "./struct-reader.js";

describe('integer primitives', () => {
  it('reads an unsigned byte', () => {
    expect(readUint8(dataViewOf(new Uint8Array([0xff])), 0)).toBe(255);
  });

  it('reads a signed byte', () => {
    expect(readInt8(dataViewOf(new Uint8Array([0xff])), 0)).toBe(-1);
  });

  it('reads a little-endian uint16', () => {
    expect(readUint16(dataViewOf(new Uint8Array([0x34, 0x12])), 0, 'LE')).toBe(0x1234);
  });

  it('reads a big-endian uint16', () => {
    expect(readUint16(dataViewOf(new Uint8Array([0x12, 0x34])), 0, 'BE')).toBe(0x1234);
  });

  it('reads a little-endian int32', () => {
    expect(readInt32(dataViewOf(new Uint8Array([0xff, 0xff, 0xff, 0xff])), 0, 'LE')).toBe(-1);
  });

  it('reads a big-endian uint32', () => {
    expect(readUint32(dataViewOf(new Uint8Array([0x00, 0x00, 0x01, 0x00])), 0, 'BE')).toBe(256);
  });

  it('reads a little-endian uint64 as a bigint', () => {
    const bytes = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(readUint64(dataViewOf(bytes), 0, 'LE')).toBe(1n);
  });

  it('reads a big-endian int64 as a bigint', () => {
    const bytes = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    expect(readInt64(dataViewOf(bytes), 0, 'BE')).toBe(-1n);
  });

  it('reads at a nonzero offset', () => {
    expect(readUint8(dataViewOf(new Uint8Array([0, 0, 0x2a])), 2)).toBe(0x2a);
  });

  it('throws for an out-of-range offset', () => {
    expect(() => readUint32(dataViewOf(new Uint8Array([1, 2])), 0, 'LE')).toThrow();
  });
});

describe('float primitives', () => {
  it('reads a little-endian float32', () => {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, 1.5, true);
    expect(readFloat32(view, 0, 'LE')).toBeCloseTo(1.5);
  });

  it('reads a big-endian float64', () => {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, 3.25, false);
    expect(readFloat64(view, 0, 'BE')).toBeCloseTo(3.25);
  });
});

describe('readFixedString', () => {
  it('reads and trims trailing NUL padding', () => {
    const bytes = new Uint8Array([0x41, 0x42, 0x00, 0x00]);
    expect(readFixedString(bytes, 0, 4)).toBe('AB');
  });

  it('reads a string with no padding', () => {
    const bytes = new Uint8Array([0x41, 0x42, 0x43]);
    expect(readFixedString(bytes, 0, 3)).toBe('ABC');
  });

  it('reads at a nonzero offset', () => {
    const bytes = new Uint8Array([0, 0, 0x41, 0x42, 0]);
    expect(readFixedString(bytes, 2, 3)).toBe('AB');
  });

  it('throws when the field would run past the end of the buffer', () => {
    expect(() => readFixedString(new Uint8Array([0x41]), 0, 5)).toThrow();
  });
});

describe('dataViewOf', () => {
  it('respects a subarray\'s byte offset', () => {
    const full = new Uint8Array([0, 0, 0x2a, 0]);
    const sub = full.subarray(2);
    expect(readUint8(dataViewOf(sub), 0)).toBe(0x2a);
  });
});
