import {
  bytesToHex,
  bytesToTextAscii,
  bytesToTextUtf16,
  bytesToTextUtf8,
  hexToBytes,
  textToBytesAscii,
  textToBytesUtf16,
  textToBytesUtf8,
} from "../../shared/utils/byte-codec.js";

export type HexTextDirection = 'toHex' | 'toText';
export type HexTextEncoding = 'ascii' | 'utf8' | 'utf16le' | 'utf16be';

export type HexTextResult = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string };

export function convertHexText(input: string, direction: HexTextDirection, encoding: HexTextEncoding): HexTextResult {
  if (direction === 'toHex') {
    const bytes = encodeTextToBytes(input, encoding);
    if (!bytes.ok) return bytes;
    return { ok: true, value: bytesToHex(bytes.value) };
  }

  const bytes = hexToBytes(input);
  if (!bytes.ok) return bytes;
  return decodeBytesToText(bytes.value, encoding);
}

function encodeTextToBytes(
  text: string,
  encoding: HexTextEncoding,
): { readonly ok: true; readonly value: Uint8Array } | { readonly ok: false; readonly error: string } {
  switch (encoding) {
    case 'ascii':
      return textToBytesAscii(text);
    case 'utf8':
      return { ok: true, value: textToBytesUtf8(text) };
    case 'utf16le':
      return { ok: true, value: textToBytesUtf16(text, 'LE') };
    case 'utf16be':
      return { ok: true, value: textToBytesUtf16(text, 'BE') };
  }
}

function decodeBytesToText(bytes: Uint8Array, encoding: HexTextEncoding): HexTextResult {
  switch (encoding) {
    case 'ascii':
      return bytesToTextAscii(bytes);
    case 'utf8':
      return bytesToTextUtf8(bytes);
    case 'utf16le':
      return bytesToTextUtf16(bytes, 'LE');
    case 'utf16be':
      return bytesToTextUtf16(bytes, 'BE');
  }
}
