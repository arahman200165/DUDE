/**
 * Printable-string extraction from arbitrary binary data, in the spirit of
 * the Unix `strings` utility (`strings -a` for ASCII, `strings -e l` for
 * little-endian UTF-16).
 */

export type StringEncoding = 'ascii' | 'utf16le';

export interface ExtractedString {
  readonly offset: number;
  readonly text: string;
  readonly encoding: StringEncoding;
}

const MIN_PRINTABLE = 0x20;
const MAX_PRINTABLE = 0x7e;

function isPrintable(byte: number): boolean {
  return byte >= MIN_PRINTABLE && byte <= MAX_PRINTABLE;
}

export function extractAsciiStrings(bytes: Uint8Array, minLength = 4): readonly ExtractedString[] {
  const results: ExtractedString[] = [];
  let runStart = -1;

  for (let i = 0; i <= bytes.length; i++) {
    const printable = i < bytes.length && isPrintable(bytes[i]);
    if (printable) {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      const length = i - runStart;
      if (length >= minLength) {
        results.push({ offset: runStart, text: bytesToAscii(bytes, runStart, i), encoding: 'ascii' });
      }
      runStart = -1;
    }
  }
  return results;
}

function bytesToAscii(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/** Scans for runs of `<printable-ascii-byte> 0x00` pairs -- the common ASCII-range subset of little-endian UTF-16 text. */
export function extractUtf16LeStrings(bytes: Uint8Array, minLength = 4): readonly ExtractedString[] {
  const results: ExtractedString[] = [];
  let runStart = -1;
  let runChars = 0;

  const isUtf16Char = (i: number): boolean => i + 1 < bytes.length && isPrintable(bytes[i]) && bytes[i + 1] === 0x00;

  let i = 0;
  while (i <= bytes.length) {
    const matches = i < bytes.length - 1 && isUtf16Char(i);
    if (matches) {
      if (runStart === -1) runStart = i;
      runChars++;
      i += 2;
      continue;
    }

    if (runStart !== -1) {
      if (runChars >= minLength) {
        let text = '';
        for (let j = runStart; j < runStart + runChars * 2; j += 2) text += String.fromCharCode(bytes[j]);
        results.push({ offset: runStart, text, encoding: 'utf16le' });
      }
      runStart = -1;
      runChars = 0;
    }
    i++;
  }
  return results;
}

export function extractBinaryStrings(bytes: Uint8Array, minLength = 4): readonly ExtractedString[] {
  return [...extractAsciiStrings(bytes, minLength), ...extractUtf16LeStrings(bytes, minLength)].sort((a, b) => a.offset - b.offset);
}
