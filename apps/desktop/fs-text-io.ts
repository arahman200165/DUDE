import iconv from 'iconv-lite';
import { promises as fs } from 'node:fs';
import { isProbablyBinary, sniffBom, type Bom } from "@dude/tool-engine/shared/fs/text-normalize";

/**
 * Encoding-aware text reading/writing for the fs utility process (Phase 29 — Tree Search replace,
 * Batch Text Converter). `iconv-lite` is bundled into the worker only; the renderer never loads it.
 * A file's encoding and BOM are detected once and reused on write, so a replace or line-ending fix
 * never silently re-encodes a Windows-1252 or UTF-16 file as UTF-8.
 */

export interface DecodedText {
  readonly text: string;
  /** iconv-lite encoding name ('utf8', 'utf16le', 'utf16be', 'win1252', 'shift_jis', …). */
  readonly encoding: string;
  readonly bom: boolean;
  readonly bytes: Buffer;
}

export const MAX_TEXT_BYTES = 32 * 1024 * 1024;

const BOM_ENCODINGS: Readonly<Record<Bom, string>> = { 'utf-8': 'utf8', 'utf-16le': 'utf16le', 'utf-16be': 'utf16be' };

export function isValidUtf8(bytes: Uint8Array): boolean {
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true; } catch { return false; }
}

export function encodingSupported(encoding: string): boolean {
  return iconv.encodingExists(encoding);
}

/** Detects BOM → valid UTF-8 → `fallback` (default Windows-1252), in that order. */
export function detectEncoding(bytes: Uint8Array, fallback = 'win1252'): { encoding: string; bom: boolean } {
  const bom = sniffBom(bytes);
  if (bom) return { encoding: BOM_ENCODINGS[bom], bom: true };
  if (isValidUtf8(bytes)) return { encoding: 'utf8', bom: false };
  return { encoding: encodingSupported(fallback) ? fallback : 'win1252', bom: false };
}

export function decodeBytes(bytes: Buffer, encoding?: string, fallback?: string): DecodedText {
  const detected = encoding ? { encoding, bom: !!sniffBom(bytes) && BOM_ENCODINGS[sniffBom(bytes)!] === encoding } : detectEncoding(bytes, fallback);
  const body = detected.bom ? bytes.subarray(detected.encoding === 'utf8' ? 3 : 2) : bytes;
  return { text: iconv.decode(body, detected.encoding), encoding: detected.encoding, bom: detected.bom, bytes };
}

export function encodeText(text: string, encoding: string, bom: boolean): Buffer {
  return iconv.encode(text, encoding, { addBOM: bom && /^utf(8|16le|16be|-8|-16le|-16be)$/i.test(encoding) });
}

/** Reads a text file, or returns null for binary/oversized files. */
export async function readTextFile(path: string, options: { fallback?: string; maxBytes?: number } = {}): Promise<DecodedText | null> {
  const info = await fs.stat(path);
  if (info.size > (options.maxBytes ?? MAX_TEXT_BYTES)) return null;
  const bytes = await fs.readFile(path);
  if (isProbablyBinary(bytes)) return null;
  return decodeBytes(bytes, undefined, options.fallback);
}

/** True when `text` survives a round trip through `encoding` unchanged (no unmappable characters). */
export function roundTrips(text: string, encoding: string): boolean {
  return iconv.decode(iconv.encode(text, encoding), encoding) === text;
}

/** Splits text into lines keeping each line's own terminator, so rewrites preserve mixed EOLs. */
export function splitLines(text: string): { line: string; eol: string }[] {
  const out: { line: string; eol: string }[] = [];
  const pattern = /\r\n|\n|\r/g;
  let start = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    out.push({ line: text.slice(start, match.index), eol: match[0] });
    start = match.index + match[0].length;
  }
  if (start < text.length || !out.length) out.push({ line: text.slice(start), eol: '' });
  return out;
}
