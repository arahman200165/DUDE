import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { PasswordAnalysis, StrengthVerdict, analyzePassword } from "@dude/tool-engine/tools/password-strength-analyzer/password-strength-logic";

/**
 * CROSSCHECK: an independently-written reference entropy calculator (own char-class
 * detection, not a reuse of `password-strength-logic.ts`'s `detectCharsetSize`/entropy
 * formula) built directly from the standard charset-entropy definition
 * (entropy = length * log2(charsetSize), the formula NIST SP 800-63B-style guidance uses
 * for a randomly-drawn string's strength) so a bug in the source's own formula doesn't hide
 * from its own test.
 */
function referenceCharsetSize(pw: string): number {
  let size = 0;
  if (/[a-z]/.test(pw)) size += 26;
  if (/[A-Z]/.test(pw)) size += 26;
  if (/[0-9]/.test(pw)) size += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) size += 33;
  return size;
}

function referenceEntropyBits(pw: string): number {
  const charsetSize = referenceCharsetSize(pw);
  return pw.length === 0 || charsetSize === 0 ? 0 : pw.length * Math.log2(charsetSize);
}

const VERDICTS: readonly StrengthVerdict[] = ['very-weak', 'weak', 'fair', 'good', 'strong'];
const VERDICT_ORDER: Record<StrengthVerdict, number> = { 'very-weak': 0, weak: 1, fair: 2, good: 3, strong: 4 };

describe('analyzePassword (CROSSCHECK: independent reference entropy formula)', () => {
  it('never throws for arbitrary strings, and returns a well-shaped analysis', () => {
    neverThrows((pw: string) => analyzePassword(pw), fc.string({ maxLength: 200 }), {
      assertShape: (result) => {
        const r = result as PasswordAnalysis;
        expect(r.entropyBits).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(r.entropyBits)).toBe(true);
        expect(VERDICTS).toContain(r.verdict);
        expect(Array.isArray(r.penalties)).toBe(true);
        expect(typeof r.estimatedCrackTime).toBe('string');
      },
    });
  });

  it('matches the independent reference charsetSize/entropy calculation for arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (pw) => {
        const result = analyzePassword(pw);
        expect(result.charsetSize).toBe(referenceCharsetSize(pw));
        expect(result.entropyBits).toBeCloseTo(referenceEntropyBits(pw), 6);
      }),
      { numRuns: 200 },
    );
  });

  it('is deterministic: analyzing the same password twice gives identical results', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (pw) => {
        expect(analyzePassword(pw)).toEqual(analyzePassword(pw));
      }),
      { numRuns: 100 },
    );
  });

  it('never scores a longer, penalty-free prefix-extension strictly worse than the shorter prefix', () => {
    // Restricted to cases where neither the shorter nor the longer string triggers any pattern
    // penalty: `verdictFor` treats a fixed -10-per-penalty deduction against a variable, often
    // smaller (~log2(charsetSize) per character) entropy gain, so crossing a penalty threshold
    // (e.g. a 4-char repeat/sequence run appearing only in the longer string) CAN legitimately
    // lower the verdict despite the extra character — that's the analyzer's designed behavior
    // (DUDE_PRD.md's explicit pattern-penalty tradeoff), not a bug, so it's out of scope here.
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9!@#$%^&*]{4,40}$/),
        fc.integer({ min: 1, max: 39 }),
        (base, cutAt) => {
          const cut = Math.min(cutAt, base.length - 1);
          if (cut < 1) return;
          const shorter = analyzePassword(base.slice(0, cut));
          const longer = analyzePassword(base.slice(0, cut + 1));
          if (shorter.penalties.length > 0 || longer.penalties.length > 0) return;
          expect(VERDICT_ORDER[longer.verdict]).toBeGreaterThanOrEqual(VERDICT_ORDER[shorter.verdict]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('returns zero entropy, "very-weak", and "n/a" crack time only for the empty password', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (pw) => {
        expect(analyzePassword(pw).estimatedCrackTime).not.toBe('n/a');
      }),
      { numRuns: 200 },
    );

    const empty = analyzePassword('');
    expect(empty.entropyBits).toBe(0);
    expect(empty.verdict).toBe('very-weak');
    expect(empty.estimatedCrackTime).toBe('n/a');
  });
});
