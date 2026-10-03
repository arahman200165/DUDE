import { diffJson, hasDifferences, stableJson } from './json-diff';

describe('json-diff', () => {
  it('prints equal values identically regardless of key order', () => {
    expect(stableJson({ b: 1, a: { d: 1, c: 2 } })).toBe(stableJson({ a: { c: 2, d: 1 }, b: 1 }));
  });

  it('reports identical values as all-same rows', () => {
    const rows = diffJson({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 });
    expect(hasDifferences(rows)).toBe(false);
    expect(rows.every((r) => r.left === r.right)).toBe(true);
  });

  it('pairs a changed field into one changed row', () => {
    const rows = diffJson({ a: 1, b: 2 }, { a: 1, b: 3 });
    const changed = rows.filter((r) => r.kind !== 'same');
    expect(changed).toEqual([{ kind: 'changed', left: '  "b": 2', right: '  "b": 3' }]);
  });

  it('shows added and removed fields on one side only', () => {
    const rows = diffJson({ a: 1 }, { a: 1, b: 2 });
    // `"a": 1` gains a trailing comma on the right, so it pairs as changed; the new field is added.
    expect(rows.some((r) => r.kind === 'added' && r.right === '  "b": 2')).toBe(true);
    expect(rows.some((r) => r.kind === 'removed')).toBe(false);
    const reverse = diffJson({ a: 1, b: 2 }, { a: 1 });
    expect(reverse.some((r) => r.kind === 'removed' && r.left === '  "b": 2')).toBe(true);
  });

  it('handles a deleted side (null) against an object', () => {
    const rows = diffJson(null, { a: 1 });
    expect(hasDifferences(rows)).toBe(true);
    expect(rows[0]!.left).toBe('null');
  });

  it('falls back to a positional comparison for very large inputs', () => {
    const big = Array.from({ length: 2500 }, (_, i) => i);
    const other = [...big];
    other[1200] = -1;
    const rows = diffJson(big, other);
    expect(rows.filter((r) => r.kind !== 'same')).toHaveLength(1);
  });
});
