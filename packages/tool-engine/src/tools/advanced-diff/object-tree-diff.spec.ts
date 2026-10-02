import { diffTrees, parseSemanticInput } from "./object-tree-diff.js";

describe('parseSemanticInput', () => {
  it('parses JSON', () => {
    const result = parseSemanticInput('{"a":1}', 'json');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('reports a JSON parse error', () => {
    const result = parseSemanticInput('{not json', 'json');
    expect(result.ok).toBe(false);
  });

  it('parses YAML', () => {
    const result = parseSemanticInput('a: 1\nb:\n  c: 2\n', 'yaml');
    expect(result).toEqual({ ok: true, value: { a: 1, b: { c: 2 } } });
  });

  it('reports a YAML parse error', () => {
    const result = parseSemanticInput('a: [1, 2\n', 'yaml');
    expect(result.ok).toBe(false);
  });

  it('parses XML, surfacing attributes with the @_ prefix', () => {
    const result = parseSemanticInput('<root id="1"><name>Bob</name></root>', 'xml');
    expect(result).toEqual({ ok: true, value: { root: { '@_id': '1', name: 'Bob' } } });
  });
});

describe('diffTrees', () => {
  it('detects an added key', () => {
    const result = diffTrees({ a: 1 }, { a: 1, b: 2 }, { ignoreCase: false });
    expect(result.entries).toEqual([{ path: '/b', op: 'add', newValue: 2 }]);
    expect(result.summary).toEqual({ added: 1, removed: 0, changed: 0 });
  });

  it('detects a removed key, with the original value attached', () => {
    const result = diffTrees({ a: 1, b: 2 }, { a: 1 }, { ignoreCase: false });
    expect(result.entries).toEqual([{ path: '/b', op: 'remove', oldValue: 2 }]);
    expect(result.summary).toEqual({ added: 0, removed: 1, changed: 0 });
  });

  it('detects a changed value, with both old and new values attached', () => {
    const result = diffTrees({ a: 1 }, { a: 2 }, { ignoreCase: false });
    expect(result.entries).toEqual([{ path: '/a', op: 'replace', oldValue: 1, newValue: 2 }]);
    expect(result.summary).toEqual({ added: 0, removed: 0, changed: 1 });
  });

  it('detects nested changes by path', () => {
    const result = diffTrees({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } }, { ignoreCase: false });
    expect(result.entries).toEqual([{ path: '/a/b/c', op: 'replace', oldValue: 1, newValue: 2 }]);
  });

  it('detects array element changes', () => {
    const result = diffTrees({ list: [1, 2, 3] }, { list: [1, 2] }, { ignoreCase: false });
    expect(result.entries).toEqual([{ path: '/list/2', op: 'remove', oldValue: 3 }]);
  });

  it('reports no entries for identical trees', () => {
    expect(diffTrees({ a: 1 }, { a: 1 }, { ignoreCase: false }).entries).toEqual([]);
  });

  it('treats case-different string leaves as equal when ignoreCase is set', () => {
    const result = diffTrees({ name: 'Bob' }, { name: 'bob' }, { ignoreCase: true });
    expect(result.entries).toEqual([]);
  });

  it('still treats a differently-cased KEY as a real change even with ignoreCase (keys are never folded)', () => {
    const result = diffTrees({ Name: 'x' }, { name: 'x' }, { ignoreCase: true });
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('displays the real original value, not the lowercased comparison value, when ignoreCase changes something else', () => {
    const result = diffTrees({ name: 'Bob', age: 1 }, { name: 'bob', age: 2 }, { ignoreCase: true });
    expect(result.entries).toEqual([{ path: '/age', op: 'replace', oldValue: 1, newValue: 2 }]);
  });
});
