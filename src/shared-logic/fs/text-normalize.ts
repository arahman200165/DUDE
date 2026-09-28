/**
 * Text sniffing and normalization shared by Duplicate Files' content groups (Phase 29 item 17) and
 * the Batch Text Converter (item 7/8): binary detection, BOM-aware decoding, and whitespace/EOL
 * normalization for "same content, different bytes" comparison.
 */

export type Bom = 'utf-8' | 'utf-16le' | 'utf-16be';

export function sniffBom(bytes: Uint8Array): Bom | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe && !(bytes[2] === 0 && bytes[3] === 0)) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return null;
}

/** Git's heuristic: a NUL byte in the first 8000 bytes means binary (UTF-16 with a BOM is text). */
export function isProbablyBinary(bytes: Uint8Array): boolean {
  const bom = sniffBom(bytes);
  if (bom === 'utf-16le' || bom === 'utf-16be') return false;
  const limit = Math.min(bytes.length, 8000);
  for (let index = 0; index < limit; index++) if (bytes[index] === 0) return true;
  return false;
}

/** BOM-aware decode; without a BOM, UTF-8 (invalid sequences become U+FFFD). */
export function decodeText(bytes: Uint8Array): string {
  const bom = sniffBom(bytes);
  if (bom === 'utf-16le') return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bom === 'utf-16be') return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bom ? bytes.subarray(3) : bytes);
}

export interface NormalizeOptions {
  readonly lineEndings: boolean;
  readonly trailingWhitespace: boolean;
  readonly allWhitespace: boolean;
  readonly caseInsensitive: boolean;
  readonly finalNewline: boolean;
}

export const DEFAULT_NORMALIZE: NormalizeOptions = { lineEndings: true, trailingWhitespace: true, allWhitespace: false, caseInsensitive: false, finalNewline: true };

export function normalizeText(text: string, options: NormalizeOptions): string {
  let value = text;
  if (options.allWhitespace) value = value.replace(/\s+/g, '');
  else {
    if (options.lineEndings) value = value.replace(/\r\n?/g, '\n');
    if (options.trailingWhitespace) value = value.replace(/[ \t]+(?=\r?\n|$)/g, '');
    if (options.finalNewline) value = value.replace(/(\r?\n)+$/, '');
  }
  return options.caseInsensitive ? value.toLowerCase() : value;
}
