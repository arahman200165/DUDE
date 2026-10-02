import { ExtractedString, extractAsciiStrings, extractUtf16LeStrings } from "../../shared/utils/binary-strings.js";

export interface BinaryStringsOptions {
  readonly minLength: number;
  readonly includeAscii: boolean;
  readonly includeUtf16Le: boolean;
}

export interface BinaryStringsReport {
  readonly byteLength: number;
  readonly strings: readonly ExtractedString[];
  readonly truncated: boolean;
}

/** Caps the returned list so an enormous or highly-repetitive file can't stall the UI rendering thousands of rows. */
const MAX_RESULTS = 5000;

export function extractStringsReport(bytes: Uint8Array, options: BinaryStringsOptions): BinaryStringsReport {
  const ascii = options.includeAscii ? extractAsciiStrings(bytes, options.minLength) : [];
  const utf16le = options.includeUtf16Le ? extractUtf16LeStrings(bytes, options.minLength) : [];
  const merged = [...ascii, ...utf16le].sort((a, b) => a.offset - b.offset);

  return {
    byteLength: bytes.length,
    strings: merged.slice(0, MAX_RESULTS),
    truncated: merged.length > MAX_RESULTS,
  };
}
