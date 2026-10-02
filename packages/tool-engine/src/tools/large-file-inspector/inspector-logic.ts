/**
 * Pure paging helpers for the Large-File Streaming Inspector (Phase 29 item 14): hex rows for any
 * window of a file, offset parsing, and locating a line through the worker's sparse line index.
 */

export const BYTES_PER_ROW = 16;

export interface HexRow {
  readonly offset: number;
  readonly hex: readonly string[];
  readonly ascii: string;
}

export function hexRows(bytes: Uint8Array, baseOffset: number): HexRow[] {
  const rows: HexRow[] = [];
  for (let start = 0; start < bytes.length; start += BYTES_PER_ROW) {
    const slice = bytes.subarray(start, start + BYTES_PER_ROW);
    rows.push({
      offset: baseOffset + start,
      hex: Array.from(slice, (byte) => byte.toString(16).padStart(2, '0')),
      ascii: Array.from(slice, (byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.')).join(''),
    });
  }
  return rows;
}

export function formatOffset(offset: number): string {
  return offset.toString(16).toUpperCase().padStart(offset > 0xffffffff ? 12 : 8, '0');
}

/** Accepts `0x1F4`, `1F4h`, decimal, or sizes like `512MiB` / `1.5 GB`; clamps into the file. */
export function parseOffset(input: string, size: number): number | null {
  const value = input.trim().replace(/_/g, '');
  let offset: number;
  const hex = /^(?:0x([0-9a-f]+)|([0-9a-f]+)h)$/i.exec(value);
  const sized = /^(\d+(?:\.\d+)?)\s*(k|m|g|t)i?b?$/i.exec(value);
  if (hex) offset = parseInt(hex[1] ?? hex[2], 16);
  else if (sized) offset = Math.round(Number(sized[1]) * 1024 ** ('kmgt'.indexOf(sized[2].toLowerCase()) + 1));
  else if (/^\d+$/.test(value)) offset = Number(value);
  else if (/^\d+(\.\d+)?%$/.test(value)) offset = Math.round((Number(value.slice(0, -1)) / 100) * size);
  else return null;
  return Number.isSafeInteger(offset) ? Math.max(0, Math.min(offset, Math.max(0, size - 1))) : null;
}

export function alignRow(offset: number): number { return offset - (offset % BYTES_PER_ROW); }

export interface LineIndex { readonly stride: number; readonly offsets: readonly number[]; readonly lines: number; readonly size: number }

/** Byte offset to start reading from, and how many lines to skip there, to reach 1-based `line`. */
export function locateLine(index: LineIndex, line: number): { offset: number; skip: number } {
  const target = Math.max(1, Math.min(line, Math.max(1, index.lines)));
  const slot = Math.min(Math.floor((target - 1) / index.stride), index.offsets.length - 1);
  return { offset: index.offsets[slot], skip: target - 1 - slot * index.stride };
}

/** Splits decoded text into lines (dropping CR of CRLF); the last piece is incomplete unless `atEof`. */
export function splitChunk(text: string, atEof: boolean): string[] {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  if (!atEof) lines.pop();
  else if (lines.length && lines[lines.length - 1] === '' && text.endsWith('\n')) lines.pop();
  return lines;
}
