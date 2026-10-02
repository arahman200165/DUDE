import { alignRow, formatOffset, hexRows, locateLine, parseOffset, splitChunk } from "./inspector-logic.js";

describe('large file inspector logic', () => {
  it('renders hex rows with offsets and printable ASCII', () => {
    const rows = hexRows(new Uint8Array([0x4d, 0x5a, 0x00, 0x41, ...new Array(14).fill(0x2e)]), 0x100);
    expect(rows).toHaveLength(2);
    expect(rows[0].offset).toBe(0x100);
    expect(rows[0].hex.slice(0, 4)).toEqual(['4d', '5a', '00', '41']);
    expect(rows[0].ascii.slice(0, 4)).toBe('MZ.A');
    expect(rows[1].hex).toHaveLength(2);
    expect(formatOffset(0x1f4)).toBe('000001F4');
    expect(formatOffset(0x1_0000_0000)).toBe('000100000000');
  });

  it('parses hex, decimal, size, and percent offsets and clamps them', () => {
    expect(parseOffset('0x1F4', 10_000)).toBe(500);
    expect(parseOffset('1F4h', 10_000)).toBe(500);
    expect(parseOffset('1_000', 10_000)).toBe(1000);
    expect(parseOffset('2KiB', 10_000)).toBe(2048);
    expect(parseOffset('1.5 GB', 4 * 1024 ** 3)).toBe(1.5 * 1024 ** 3);
    expect(parseOffset('50%', 1000)).toBe(500);
    expect(parseOffset('999999', 100)).toBe(99);
    expect(parseOffset('nope', 100)).toBeNull();
    expect(alignRow(35)).toBe(32);
  });

  it('locates lines through the sparse index and splits chunks at line boundaries', () => {
    const index = { stride: 1000, offsets: [0, 5000, 11000], lines: 2500, size: 20000 };
    expect(locateLine(index, 1)).toEqual({ offset: 0, skip: 0 });
    expect(locateLine(index, 1000)).toEqual({ offset: 0, skip: 999 });
    expect(locateLine(index, 1001)).toEqual({ offset: 5000, skip: 0 });
    expect(locateLine(index, 2400)).toEqual({ offset: 11000, skip: 399 });
    expect(locateLine(index, 99999)).toEqual({ offset: 11000, skip: 499 });
    expect(splitChunk('a\r\nb\nparti', false)).toEqual(['a', 'b']);
    expect(splitChunk('a\nb\n', true)).toEqual(['a', 'b']);
    expect(splitChunk('a\nlast', true)).toEqual(['a', 'last']);
  });
});
