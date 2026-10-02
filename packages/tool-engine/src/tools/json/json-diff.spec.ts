import { computeJsonDiff, diffJsonValues } from "./json-diff.js";

describe('diffJsonValues', () => {
  it('returns no entries for identical values', () => {
    expect(diffJsonValues({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toEqual([]);
  });

  it('reports an added object key', () => {
    expect(diffJsonValues({ a: 1 }, { a: 1, b: 2 })).toEqual([{ path: '$.b', kind: 'added', after: 2 }]);
  });

  it('reports a removed object key', () => {
    expect(diffJsonValues({ a: 1, b: 2 }, { a: 1 })).toEqual([{ path: '$.b', kind: 'removed', before: 2 }]);
  });

  it('reports a changed primitive value', () => {
    expect(diffJsonValues({ a: 1 }, { a: 2 })).toEqual([{ path: '$.a', kind: 'changed', before: 1, after: 2 }]);
  });

  it('reports a type change', () => {
    expect(diffJsonValues({ a: 1 }, { a: 'one' })).toEqual([{ path: '$.a', kind: 'type-changed', before: 1, after: 'one' }]);
  });

  it('recurses into nested objects', () => {
    expect(diffJsonValues({ a: { b: 1 } }, { a: { b: 2 } })).toEqual([{ path: '$.a.b', kind: 'changed', before: 1, after: 2 }]);
  });

  it('reports added and removed array elements by index', () => {
    expect(diffJsonValues([1, 2], [1, 2, 3])).toEqual([{ path: '$[2]', kind: 'added', after: 3 }]);
    expect(diffJsonValues([1, 2, 3], [1, 2])).toEqual([{ path: '$[2]', kind: 'removed', before: 3 }]);
  });

  it('reports a changed array element', () => {
    expect(diffJsonValues([1, 2, 3], [1, 9, 3])).toEqual([{ path: '$[1]', kind: 'changed', before: 2, after: 9 }]);
  });

  it('distinguishes null from other types', () => {
    expect(diffJsonValues({ a: null }, { a: 1 })).toEqual([{ path: '$.a', kind: 'type-changed', before: null, after: 1 }]);
  });

  it('treats top-level type changes as a single entry', () => {
    expect(diffJsonValues({ a: 1 }, [1])).toEqual([{ path: '$', kind: 'type-changed', before: { a: 1 }, after: [1] }]);
  });
});

describe('computeJsonDiff', () => {
  it('parses and diffs both sides', () => {
    expect(computeJsonDiff('{"a":1}', '{"a":2}')).toEqual({ ok: true, entries: [{ path: '$.a', kind: 'changed', before: 1, after: 2 }] });
  });

  it('names the left side when it fails to parse', () => {
    const result = computeJsonDiff('{not json', '{}');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.side).toBe('left');
  });

  it('names the right side when it fails to parse', () => {
    const result = computeJsonDiff('{}', '{not json');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.side).toBe('right');
  });
});
