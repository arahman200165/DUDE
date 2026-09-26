import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyRot } from './rot-cipher';

describe('ROT13', () => {
  it('shifts letters by 13, preserving case and leaving non-letters untouched', () => {
    expect(applyRot('Hello, World! 123', 'rot13')).toBe('Uryyb, Jbeyq! 123');
  });

  it('is self-inverse', () => {
    const text = 'The Quick Brown Fox.';
    expect(applyRot(applyRot(text, 'rot13'), 'rot13')).toBe(text);
  });
});

describe('ROT47', () => {
  it('shifts printable ASCII by 47, leaving control chars/whitespace untouched', () => {
    expect(applyRot('Hello, World!', 'rot47')).toBe('w6==@[ (@C=5P');
  });

  it('is self-inverse', () => {
    const text = 'The Quick Brown Fox! 123 #hashtag';
    expect(applyRot(applyRot(text, 'rot47'), 'rot47')).toBe(text);
  });
});

describe('round-trip / self-inverse property (DUDE_PRD.md §21 Phase 23 Item 4)', () => {
  it('applyRot(applyRot(x, mode), mode) === x for arbitrary text, in either mode', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom('rot13', 'rot47') as fc.Arbitrary<'rot13' | 'rot47'>, (text, mode) => {
        expect(applyRot(applyRot(text, mode), mode)).toBe(text);
      }),
    );
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input, in either mode', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom('rot13', 'rot47') as fc.Arbitrary<'rot13' | 'rot47'>, (text, mode) => {
        expect(() => applyRot(text, mode)).not.toThrow();
      }),
    );
  });
});
