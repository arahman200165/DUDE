import { resolveJsonPointer } from './json-pointer-transform';

describe('resolveJsonPointer', () => {
  const doc = '{"a":{"b":1,"c":[10,20,30]},"d~e":true,"f/g":true}';

  it('passes the RFC 6901 section 5 JSON Pointer examples', () => {
    const rfcDocument = String.raw`{"foo":["bar","baz"],"":0,"a/b":1,"c%d":2,"e^f":3,"g|h":4,"i\\j":5,"k\"l":6," ":7,"m~n":8}`;
    const vectors: readonly [string, string][] = [
      ['', '{\n  "foo": [\n    "bar",\n    "baz"\n  ],\n  "": 0,\n  "a/b": 1,\n  "c%d": 2,\n  "e^f": 3,\n  "g|h": 4,\n  "i\\\\j": 5,\n  "k\\\"l": 6,\n  " ": 7,\n  "m~n": 8\n}'],
      ['/foo', '[\n  "bar",\n  "baz"\n]'],
      ['/foo/0', '"bar"'],
      ['/', '0'],
      ['/a~1b', '1'],
      ['/c%d', '2'],
      ['/e^f', '3'],
      ['/g|h', '4'],
      ['/i\\j', '5'],
      ['/k"l', '6'],
      ['/ ', '7'],
      ['/m~0n', '8'],
    ];

    for (const [pointer, output] of vectors) {
      expect(resolveJsonPointer(rfcDocument, pointer)).toEqual({ ok: true, output });
    }
  });

  it('resolves a nested object path', () => {
    expect(resolveJsonPointer(doc, '/a/b')).toEqual({ ok: true, output: '1' });
  });

  it('resolves an array index', () => {
    expect(resolveJsonPointer(doc, '/a/c/1')).toEqual({ ok: true, output: '20' });
  });

  it('unescapes ~0 and ~1 in reference tokens', () => {
    expect(resolveJsonPointer(doc, '/d~0e')).toEqual({ ok: true, output: 'true' });
    expect(resolveJsonPointer(doc, '/f~1g')).toEqual({ ok: true, output: 'true' });
  });

  it('resolves an empty-string key with a trailing slash', () => {
    expect(resolveJsonPointer('{"":42}', '/')).toEqual({ ok: true, output: '42' });
  });

  it('rejects empty JSON input', () => {
    expect(resolveJsonPointer('', '/a').ok).toBe(false);
  });

  it('rejects a pointer that does not start with "/"', () => {
    expect(resolveJsonPointer(doc, 'a/b')).toEqual({ ok: false, error: { message: 'A JSON Pointer must start with "/".' } });
  });

  it('reports an out-of-bounds array index', () => {
    const result = resolveJsonPointer(doc, '/a/c/99');
    expect(result).toEqual({ ok: false, error: { message: 'Array index 99 is out of bounds.' } });
  });

  it('reports a missing property', () => {
    const result = resolveJsonPointer(doc, '/missing');
    expect(result).toEqual({ ok: false, error: { message: 'No property "missing" at this path.' } });
  });

  it('reports a parse error for malformed JSON', () => {
    const result = resolveJsonPointer('{"a": }', '/a');
    expect(result.ok).toBe(false);
  });
});
