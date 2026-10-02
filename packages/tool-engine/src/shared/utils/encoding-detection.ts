/**
 * BOM sniffing/stripping and a lightweight text-encoding guess, shared by the
 * Encoding Detector and BOM Detector/Remover tools.
 */

export type BomEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'utf-32le' | 'utf-32be';

export interface BomInfo {
  readonly encoding: BomEncoding;
  readonly length: number;
}

interface BomRule {
  readonly bytes: readonly number[];
  readonly encoding: BomEncoding;
}

// Longer/more specific BOMs first -- UTF-32LE's BOM is a strict superset of UTF-16LE's.
const BOM_RULES: readonly BomRule[] = [
  { bytes: [0xff, 0xfe, 0x00, 0x00], encoding: 'utf-32le' },
  { bytes: [0x00, 0x00, 0xfe, 0xff], encoding: 'utf-32be' },
  { bytes: [0xef, 0xbb, 0xbf], encoding: 'utf-8' },
  { bytes: [0xff, 0xfe], encoding: 'utf-16le' },
  { bytes: [0xfe, 0xff], encoding: 'utf-16be' },
];

export function detectBom(bytes: Uint8Array): BomInfo | null {
  for (const rule of BOM_RULES) {
    if (bytes.length < rule.bytes.length) continue;
    if (rule.bytes.every((b, i) => bytes[i] === b)) return { encoding: rule.encoding, length: rule.bytes.length };
  }
  return null;
}

export function stripBom(bytes: Uint8Array): Uint8Array {
  const bom = detectBom(bytes);
  return bom ? bytes.slice(bom.length) : bytes;
}

export function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function isAscii(bytes: Uint8Array): boolean {
  for (const byte of bytes) if (byte > 0x7f) return false;
  return true;
}

export type DetectedEncoding = 'ascii' | 'utf-8' | 'utf-8 (with BOM)' | 'utf-16le' | 'utf-16be' | 'utf-32le' | 'utf-32be' | 'windows-1252 (best guess)';

export type EncodingConfidence = 'high' | 'medium' | 'low';

export interface EncodingDetectionResult {
  readonly bom: BomInfo | null;
  readonly guess: DetectedEncoding;
  readonly confidence: EncodingConfidence;
}

/**
 * A BOM is a near-certain signal. Absent one, valid UTF-8 (a strict byte
 * grammar) is a fairly reliable guess, pure ASCII is certain by definition,
 * and anything else falls back to a low-confidence Windows-1252 guess --
 * the most common single-byte Western encoding, not an attempt at full
 * charset detection.
 */
export function detectEncoding(bytes: Uint8Array): EncodingDetectionResult {
  const bom = detectBom(bytes);
  if (bom) {
    const guess: DetectedEncoding = bom.encoding === 'utf-8' ? 'utf-8 (with BOM)' : bom.encoding;
    return { bom, guess, confidence: 'high' };
  }

  if (bytes.length === 0) return { bom: null, guess: 'ascii', confidence: 'low' };
  if (isAscii(bytes)) return { bom: null, guess: 'ascii', confidence: 'high' };
  if (isValidUtf8(bytes)) return { bom: null, guess: 'utf-8', confidence: 'medium' };
  return { bom: null, guess: 'windows-1252 (best guess)', confidence: 'low' };
}
