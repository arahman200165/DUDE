import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeText3, textHunks } from './text-merge.js';
import { merge3 } from './merge3.js';
import { SYNC_POLICIES } from './policies.js';

/** Inserts `text` at code-point `at` of `s`. */
const insertAt = (s: string, at: number, text: string): string => {
  const cps = Array.from(s);
  return [...cps.slice(0, at), text, ...cps.slice(at)].join('');
};

const words = fc.string({ unit: fc.constantFrom('a', 'b', 'c', ' ', '\n', 'é', '😀'), maxLength: 40 });

describe('mergeText3', () => {
  it('keeps edits made on different parts of the text', () => {
    expect(mergeText3('alpha beta gamma', 'ALPHA beta gamma', 'alpha beta GAMMA')).toBe('ALPHA beta GAMMA');
    expect(mergeText3('line 1\nline 2\n', 'line 1\nline 2\nmine\n', 'theirs\nline 1\nline 2\n')).toBe('theirs\nline 1\nline 2\nmine\n');
  });

  it('applies a deletion from one side and an insertion from the other', () => {
    expect(mergeText3('one two three', 'one three', 'one two three four')).toBe('one three four');
  });

  it('keeps both insertions at the same place, theirs first, without markers', () => {
    expect(mergeText3('ab', 'aXb', 'aYb')).toBe('aYXb');
  });

  it('collapses an identical change and an insertion the other side already contains', () => {
    expect(mergeText3('hello', 'hello world', 'hello world')).toBe('hello world');
    // The same edit arrived live (and someone kept typing after it) and again as a queued write.
    expect(mergeText3('hello', 'hello world', 'hello world!')).toBe('hello world!');
  });

  it('never splits a surrogate pair', () => {
    const merged = mergeText3('x😀y', 'x😁y', 'x😂y');
    expect(Array.from(merged).every((c) => c.length === 1 || /^[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(c))).toBe(true);
  });

  it('falls back to a whole-middle replacement beyond the edit-cost cap and still keeps both sides', () => {
    const base = 'x'.repeat(50);
    // Both insertions land in the end gap: theirs first.
    expect(mergeText3(base, 'y'.repeat(50), base + 'z', 4)).toBe('z' + 'y'.repeat(50));
  });

  it('property: one side unchanged gives the other side', () => {
    fc.assert(fc.property(words, words, (base, other) => {
      expect(mergeText3(base, base, other)).toBe(other);
      expect(mergeText3(base, other, base)).toBe(other);
      expect(mergeText3(base, other, other)).toBe(other);
    }));
  });

  it('property: an edit delivered twice is not duplicated', () => {
    fc.assert(fc.property(words, words, fc.nat(), (base, typed, pos) => {
      const at = pos % (Array.from(base).length + 1);
      const ours = insertAt(base, at, typed);
      // theirs already contains our edit (it came through live first)
      expect(mergeText3(base, ours, ours)).toBe(ours);
    }));
  });

  it('keeps an edit once even when the diff would place it at a different but equivalent gap on each side', () => {
    expect(mergeText3('line1\nline2\n', 'line1\nline2\nX\n', 'Y\nline1\nline2\nX\n')).toBe('Y\nline1\nline2\nX\n');
    expect(mergeText3('x\n\n', 'x\n\nq\n\n', 'z\nx\n\nq\n\n')).toBe('z\nx\n\nq\n\n');
  });

  it('property: an edit delivered twice, with an unrelated edit at the start of the live text, is kept once', () => {
    const repetitive = fc.string({ unit: fc.constantFrom('a', '\n', ' '), maxLength: 30 });
    fc.assert(fc.property(repetitive, repetitive, fc.nat(), (base, typed, pos) => {
      const at = pos % (Array.from(base).length + 1);
      const ours = insertAt(base, at, typed);
      const theirs = `#${ours}`;
      expect(mergeText3(base, ours, theirs)).toBe(theirs);
    }), { numRuns: 500 });
  });

  it('property: disjoint insertions on both sides both survive exactly once', () => {
    fc.assert(fc.property(fc.string({ unit: fc.constantFrom('a', 'b'), minLength: 2, maxLength: 30 }), fc.constantFrom('X', 'XY'), fc.constantFrom('Q', 'QR'), (base, mine, theirs) => {
      const ours = mine + base;
      const other = base + theirs;
      expect(mergeText3(base, ours, other)).toBe(mine + base + theirs);
    }));
  });

  it('property: the merge contains every inserted string from both sides', () => {
    fc.assert(fc.property(words, fc.nat(), fc.nat(), fc.constantFrom('<one>', '<two>'), fc.constantFrom('[three]', '[four]'), (base, p1, p2, a, b) => {
      const len = Array.from(base).length + 1;
      const merged = mergeText3(base, insertAt(base, p1 % len, a), insertAt(base, p2 % len, b));
      expect(merged).toContain(a);
      expect(merged).toContain(b);
    }));
  });
});

describe('merge3 field rules (PD-102)', () => {
  const script = (body: string, updatedAt: string, name = 'S') => ({ id: 's', name, body, updatedAt });

  it('merges user-script bodies as text and takes the later updatedAt', () => {
    const rules = SYNC_POLICIES['user-script'].fieldRules;
    const result = merge3(script('a\nb\n', 't1'), script('a!\nb\n', 't3'), script('a\nb!\n', 't2'), rules);
    expect(result).toEqual({ kind: 'merged', value: script('a!\nb!\n', 't3') });
  });

  it('still conflicts on a non-text field and on a text field missing from the base', () => {
    const rules = SYNC_POLICIES['user-script'].fieldRules;
    expect(merge3(script('x', 't1'), script('x', 't2', 'Mine'), script('x', 't2', 'Theirs'), rules)).toEqual({ kind: 'conflict', fields: ['name'] });
    expect(merge3(null, script('mine', 't1'), script('theirs', 't1'), rules)).toEqual({ kind: 'conflict', fields: ['body'] });
  });

  it('merges scratchpad snippets by id: per-snippet text, additions from both sides, removals win', () => {
    const rules = SYNC_POLICIES.scratchpad.fieldRules;
    const snip = (id: string, title: string, body: string) => ({ id, title, body, createdAt: '2026-10-24T00:00:00.000Z' });
    const base = { snippets: [snip('1', 'One', 'first'), snip('2', 'Two', 'second'), snip('3', 'Three', 'third')], drawerExpanded: false };
    const mine = { snippets: [snip('1', 'One', 'first edited'), snip('2', 'Two', 'second'), snip('4', 'Mine', 'new')], drawerExpanded: false };
    const theirs = { snippets: [snip('1', 'One!', 'first'), snip('3', 'Three', 'third, edited'), snip('5', 'Theirs', 'new')], drawerExpanded: false };
    const result = merge3(base, mine, theirs, rules);
    expect(result).toEqual({
      kind: 'merged',
      value: { snippets: [snip('1', 'One!', 'first edited'), snip('4', 'Mine', 'new'), snip('5', 'Theirs', 'new')], drawerExpanded: false },
    });
  });

  it('conflicts when one snippet id was added on both sides with different content', () => {
    const rules = SYNC_POLICIES.scratchpad.fieldRules;
    const result = merge3({ snippets: [] }, { snippets: [{ id: 'n', title: 'a', body: 'x' }] }, { snippets: [{ id: 'n', title: 'b', body: 'y' }] }, rules);
    expect(result).toEqual({ kind: 'conflict', fields: ['snippets'] });
  });
});

describe('textHunks', () => {
  const apply = (a: string, hunks: ReturnType<typeof textHunks>): string => {
    let out = a;
    for (const h of hunks) out = out.slice(0, h.at) + h.insert + out.slice(h.at + h.deleteCount);
    return out;
  };

  it('is empty for equal text and a single hunk for a localized edit', () => {
    expect(textHunks('same', 'same')).toEqual([]);
    expect(textHunks('hello world', 'hello brave world')).toEqual([{ at: 6, deleteCount: 0, insert: 'brave ' }]);
  });

  it('returns separate right-to-left hunks for edits in different places', () => {
    const hunks = textHunks('alpha beta gamma', 'ALPHA beta GAMMA');
    expect(hunks.length).toBe(2);
    expect(hunks[0]!.at).toBeGreaterThan(hunks[1]!.at);
    expect(apply('alpha beta gamma', hunks)).toBe('ALPHA beta GAMMA');
  });

  it('never splits a surrogate pair', () => {
    for (const [a, b] of [['a😀b', 'a😁b'], ['😀😀', '😀'], ['x', '😀x😀']] as const) {
      for (const h of textHunks(a, b)) {
        for (const index of [h.at, h.at + h.deleteCount]) {
          const code = a.charCodeAt(index);
          const prev = a.charCodeAt(index - 1);
          expect(code >= 0xdc00 && code <= 0xdfff && prev >= 0xd800 && prev <= 0xdbff).toBe(false);
        }
      }
    }
  });

  it('applying the hunks to a gives b', () => {
    fc.assert(fc.property(words, words, (a, b) => {
      expect(apply(a, textHunks(a, b))).toBe(b);
    }));
  });

  it('falls back to one replacement past the cost cap', () => {
    const a = 'abcdefghij'.repeat(5);
    const b = 'jihgfedcba'.repeat(5);
    const hunks = textHunks(a, b, 3);
    expect(hunks.length).toBe(1);
    expect(apply(a, hunks)).toBe(b);
  });
});
