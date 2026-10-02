import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from "../../../../../../tests/property-harness";
import { detectEncoding, detectBom, isAscii, isValidUtf8 } from "@dude/tool-engine/shared/utils/encoding-detection";

const BOM_CASES = [
  { bytes: [0xef, 0xbb, 0xbf], guess: 'utf-8 (with BOM)' },
  { bytes: [0xff, 0xfe, 0x00, 0x00], guess: 'utf-32le' },
  { bytes: [0x00, 0x00, 0xfe, 0xff], guess: 'utf-32be' },
  { bytes: [0xff, 0xfe], guess: 'utf-16le' },
  { bytes: [0xfe, 0xff], guess: 'utf-16be' },
] as const;

describe('encoding-detector shared utility properties', () => {
  it('returns complete, internally consistent reports for arbitrary bytes', () => {
    invariant(
      detectEncoding,
      fc.uint8Array({ maxLength: 512 }),
      (result, bytes) => {
        expect(['ascii', 'utf-8', 'utf-8 (with BOM)', 'utf-16le', 'utf-16be', 'utf-32le', 'utf-32be', 'windows-1252 (best guess)']).toContain(result.guess);
        expect(['high', 'medium', 'low']).toContain(result.confidence);
        expect(result.bom === null || result.bom.length <= bytes.length).toBe(true);
        if (result.bom) expect(result.guess).toBe(result.bom.encoding === 'utf-8' ? 'utf-8 (with BOM)' : result.bom.encoding);
        if (bytes.length > 0 && isAscii(bytes)) expect(result).toMatchObject({ bom: null, guess: 'ascii', confidence: 'high' });
        if (result.guess === 'utf-8' || result.guess === 'utf-8 (with BOM)') expect(isValidUtf8(result.bom ? bytes.subarray(result.bom.length) : bytes)).toBe(true);
        return true;
      },
    );
  });

  it('recognizes every supported BOM without mistaking UTF-32LE for UTF-16LE', () => {
    for (const { bytes, guess } of BOM_CASES) {
      const input = Uint8Array.from(bytes);
      expect(detectBom(input)).toEqual({ encoding: guess === 'utf-8 (with BOM)' ? 'utf-8' : guess, length: bytes.length });
      expect(detectEncoding(input).guess).toBe(guess);
      expect(detectEncoding(input).confidence).toBe('high');
    }
  });
});
