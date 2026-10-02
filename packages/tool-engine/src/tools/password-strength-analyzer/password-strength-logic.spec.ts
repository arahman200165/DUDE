import { describe, expect, it } from 'vitest';
import { analyzePassword } from "./password-strength-logic.js";

describe('analyzePassword', () => {
  it('computes entropy for an 8-char lowercase-only password (26^8 charset)', () => {
    const result = analyzePassword('abcdefgh');
    expect(result.charsetSize).toBe(26);
    expect(result.entropyBits).toBeCloseTo(8 * Math.log2(26), 5);
  });

  it('computes entropy for a 12-char mixed-case+digit+symbol password (95-char charset)', () => {
    const result = analyzePassword('Ab3!Xy9@Qw1#');
    expect(result.charsetSize).toBe(26 + 26 + 10 + 33);
    expect(result.entropyBits).toBeCloseTo(12 * Math.log2(26 + 26 + 10 + 33), 5);
  });

  it('returns zero entropy and very-weak verdict for an empty password', () => {
    const result = analyzePassword('');
    expect(result.entropyBits).toBe(0);
    expect(result.verdict).toBe('very-weak');
    expect(result.estimatedCrackTime).toBe('n/a');
  });

  it('flags an extremely common password', () => {
    const result = analyzePassword('password123');
    expect(result.penalties.some((p) => p.includes('common password'))).toBe(true);
    expect(result.verdict).toBe('very-weak');
  });

  it('flags a repeated-character run', () => {
    const result = analyzePassword('aaaaaaaa');
    expect(result.penalties.some((p) => p.includes('repeated character run'))).toBe(true);
  });

  it('flags a sequential run', () => {
    const result = analyzePassword('abcdefgh');
    expect(result.penalties.some((p) => p.includes('sequential run'))).toBe(true);
  });

  it('flags a keyboard-walk pattern', () => {
    const result = analyzePassword('qwertyui');
    expect(result.penalties.some((p) => p.includes('keyboard-walk'))).toBe(true);
    expect(result.verdict).toBe('very-weak');
  });

  it('a longer, more character-diverse password never scores strictly worse than a shorter, less diverse prefix of it', () => {
    const verdictOrder: Record<string, number> = { 'very-weak': 0, weak: 1, fair: 2, good: 3, strong: 4 };
    const base = 'kx7!qP2@zR9#mN5$wT1%';
    for (let len = 4; len < base.length; len++) {
      const shorter = analyzePassword(base.slice(0, len));
      const longer = analyzePassword(base.slice(0, len + 1));
      expect(verdictOrder[longer.verdict]).toBeGreaterThanOrEqual(verdictOrder[shorter.verdict]);
    }
  });

  it('a strong random password gets a good/strong verdict and no penalties', () => {
    const result = analyzePassword('kx7!qP2@zR9#mN5$wT1%');
    expect(result.penalties.length).toBe(0);
    expect(['good', 'strong']).toContain(result.verdict);
  });
});
