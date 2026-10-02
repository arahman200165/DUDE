import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { diffEnvironments, pathBreakdown, summarizeEnvDiff, toDiffViewEntries } from "./env-diff.js";

describe('diffEnvironments', () => {
  it('reports add, remove and change, sorted by name', () => {
    const entries = diffEnvironments({ A: '1', B: '2', C: '3' }, { A: '1', B: 'x', D: '4' });
    expect(entries.map((e) => [e.name, e.op])).toEqual([['B', 'change'], ['C', 'remove'], ['D', 'add']]);
    expect(summarizeEnvDiff(entries)).toEqual({ added: 1, removed: 1, changed: 1 });
  });

  it('matches names case-insensitively, as Windows does', () => {
    expect(diffEnvironments({ Path: 'a' }, { PATH: 'a' })).toEqual([]);
    const [entry] = diffEnvironments({ Path: 'a' }, { PATH: 'b' });
    expect(entry).toMatchObject({ name: 'PATH', op: 'change', before: 'a', after: 'b' });
  });

  it('accepts Maps', () => {
    expect(diffEnvironments(new Map([['X', '1']]), new Map())).toEqual([{ name: 'X', op: 'remove', before: '1' }]);
  });

  it('breaks PATH-like values into added/removed/reordered segments', () => {
    expect(pathBreakdown('C:\\a;C:\\b', 'C:\\b;C:\\c')).toEqual({ added: ['C:\\c'], removed: ['C:\\a'], reordered: false });
    expect(pathBreakdown('C:\\a;C:\\b', 'C:\\B;C:\\A')).toEqual({ added: [], removed: [], reordered: true });
    expect(pathBreakdown('one', 'two')).toBeUndefined();
    const [entry] = diffEnvironments({ Path: 'C:\\a;C:\\b' }, { Path: 'C:\\a;C:\\c' });
    expect(entry.pathBreakdown?.added).toEqual(['C:\\c']);
  });

  it('maps onto diff-view entries', () => {
    expect(toDiffViewEntries(diffEnvironments({ A: '1' }, { A: '2', B: '3' }))).toEqual([
      { path: 'A', op: 'replace', oldValue: '1', newValue: '2' },
      { path: 'B', op: 'add', newValue: '3' },
    ]);
  });

  it('an environment never differs from itself, and diffing is symmetric in size', () => {
    fc.assert(fc.property(fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), fc.string({ maxLength: 8 })), fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), fc.string({ maxLength: 8 })), (a, b) => {
      expect(diffEnvironments(a, a)).toEqual([]);
      const forward = summarizeEnvDiff(diffEnvironments(a, b));
      const backward = summarizeEnvDiff(diffEnvironments(b, a));
      expect(forward.added).toBe(backward.removed);
      expect(forward.changed).toBe(backward.changed);
    }));
  });
});
