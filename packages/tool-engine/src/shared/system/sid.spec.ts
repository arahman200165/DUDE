import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToSid, decodeSid, describeSid, formatSid, hexToBytes, parseSidString, sidToBytes, WELL_KNOWN_SIDS } from "./sid.js";

describe('sid codec', () => {
  it('parses and formats strings', () => {
    const p = parseSidString('S-1-5-21-1004336348-1177238915-682003330-512');
    expect(p.identifierAuthority).toBe(5);
    expect(p.subAuthorities).toEqual([21, 1004336348, 1177238915, 682003330, 512]);
    expect(formatSid(p)).toBe('S-1-5-21-1004336348-1177238915-682003330-512');
  });

  it('encodes S-1-5-18 to the known bytes', () => {
    expect(Array.from(sidToBytes(parseSidString('S-1-5-18')))).toEqual([1, 1, 0, 0, 0, 0, 0, 5, 18, 0, 0, 0]);
  });

  it('round-trips through bytes, hex and base64', () => {
    for (const s of ['S-1-1-0', 'S-1-5-32-544', 'S-1-16-12288', 'S-1-5-21-1-2-3-500', 'S-1-5-5-0-4294967295']) {
      const d = decodeSid(s, 'sid');
      expect(decodeSid(d.binaryHex, 'binary-hex').sid).toBe(s);
      expect(decodeSid(d.base64, 'binary-base64').sid).toBe(s);
      expect(formatSid(bytesToSid(sidToBytes(parseSidString(s))))).toBe(s);
    }
  });

  it('supports 15 subauthorities and rejects 16', () => {
    const fifteen = 'S-1-5-' + Array.from({ length: 15 }, (_, i) => i + 1).join('-');
    expect(parseSidString(fifteen).subAuthorities).toHaveLength(15);
    expect(sidToBytes(parseSidString(fifteen)).length).toBe(68);
    expect(() => parseSidString(fifteen + '-16')).toThrow(/15/);
  });

  it('handles 48-bit identifier authorities', () => {
    const bytes = sidToBytes(parseSidString('S-1-281474976710655-1'));
    expect(Array.from(bytes.slice(2, 8))).toEqual([255, 255, 255, 255, 255, 255]);
    expect(bytesToSid(bytes).identifierAuthority).toBe(281474976710655);
    expect(parseSidString('S-1-4294967296-1').identifierAuthority).toBe(4294967296);
    expect(() => parseSidString('S-1-281474976710656-1')).toThrow(/48/);
  });

  it('rejects malformed strings', () => {
    for (const bad of ['', 'S-1', 'S-1-', 'S-2-5-18', 'X-1-5-18', 'S-1-5--18', 'S-1-5-abc', 'S-1-5-4294967296', 'S-1-5-18-']) {
      expect(() => parseSidString(bad), bad).toThrow();
    }
  });

  it('rejects malformed binary', () => {
    expect(() => bytesToSid(new Uint8Array([1, 1, 0, 0, 0, 0, 0, 5]))).toThrow(/length/);
    expect(() => bytesToSid(new Uint8Array([1, 1, 0, 0, 0, 0, 0, 5, 18, 0, 0, 0, 0]))).toThrow(/length/);
    expect(() => bytesToSid(new Uint8Array([2, 0, 0, 0, 0, 0, 0, 5]))).toThrow(/revision/);
    expect(() => bytesToSid(new Uint8Array([1, 16, 0, 0, 0, 0, 0, 5]))).toThrow(/15/);
    expect(() => bytesToSid(new Uint8Array(3))).toThrow(/header/);
    expect(() => hexToBytes('zz')).toThrow();
    expect(() => hexToBytes('abc')).toThrow();
    expect(() => base64ToBytes('@@@')).toThrow();
  });

  it('accepts separators in hex', () => {
    expect(decodeSid('01:01:00:00:00:00:00:05:12:00:00:00', 'binary-hex').sid).toBe('S-1-5-18');
  });

  it('annotates well-known and RID SIDs', () => {
    expect(decodeSid('s-1-5-32-544', 'sid').wellKnownName).toBe('BUILTIN\\Administrators');
    expect(describeSid('S-1-5-18')?.name).toBe('NT AUTHORITY\\SYSTEM');
    expect(describeSid('S-1-1-0')?.name).toBe('Everyone');
    expect(describeSid('S-1-16-12288')?.name).toContain('High');
    expect(describeSid('S-1-5-21-1-2-3-512')?.name).toContain('Domain Admins');
    expect(describeSid('S-1-5-21-1-2-3-1001')?.name).toBe('Domain or machine account');
    expect(describeSid('S-1-9-9')).toBeNull();
  });

  it('has a valid unique well-known table', () => {
    const seen = new Set<string>();
    for (const e of WELL_KNOWN_SIDS) {
      expect(() => parseSidString(e.sid)).not.toThrow();
      expect(seen.has(e.sid)).toBe(false);
      seen.add(e.sid);
    }
  });
});
