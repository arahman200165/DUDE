export function parseHexByte(input: string): number | null {
  const cleaned = input.trim();
  if (!/^[0-9a-fA-F]{1,2}$/.test(cleaned)) return null;
  return parseInt(cleaned, 16);
}

export function formatHexByte(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

export function isPrintableAsciiByte(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

export function setByteAt(bytes: Uint8Array, index: number, value: number): Uint8Array {
  if (index < 0 || index >= bytes.length) throw new Error('Index out of range.');
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error('Byte value must be an integer between 0 and 255.');

  const next = bytes.slice();
  next[index] = value;
  return next;
}

export interface HexRow {
  readonly offset: number;
  readonly bytes: readonly number[];
}

export function chunkIntoRows(bytes: Uint8Array, bytesPerRow: number): readonly HexRow[] {
  if (bytesPerRow <= 0) throw new Error('bytesPerRow must be positive.');

  const rows: HexRow[] = [];
  for (let offset = 0; offset < bytes.length; offset += bytesPerRow) {
    rows.push({ offset, bytes: Array.from(bytes.subarray(offset, offset + bytesPerRow)) });
  }
  return rows;
}
