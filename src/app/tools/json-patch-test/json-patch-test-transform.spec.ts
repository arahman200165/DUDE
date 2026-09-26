import { testJsonPatch } from './json-patch-test-transform';

describe('testJsonPatch', () => {
  it('passes RFC 6902 Appendix A.1 object-add example', () => {
    expect(testJsonPatch('{"foo":"bar"}', '[{"op":"add","path":"/baz","value":"qux"}]')).toEqual({
      ok: true,
      output: '{\n  "foo": "bar",\n  "baz": "qux"\n}',
    });
  });

  it('passes RFC 6902 Appendix A.2 array-add example', () => {
    expect(testJsonPatch('{"foo":["bar","baz"]}', '[{"op":"add","path":"/foo/1","value":"qux"}]')).toEqual({
      ok: true,
      output: '{\n  "foo": [\n    "bar",\n    "qux",\n    "baz"\n  ]\n}',
    });
  });

  it('passes RFC 6902 Appendix A.14 tilde escape ordering test', () => {
    expect(testJsonPatch('{"/":9,"~1":10}', '[{"op":"test","path":"/~01","value":10}]')).toEqual({
      ok: true,
      output: '{\n  "/": 9,\n  "~1": 10\n}',
    });
  });

  it('passes RFC 6902 Appendix A.16 array append example', () => {
    expect(testJsonPatch('{"foo":["bar"]}', '[{"op":"add","path":"/foo/-","value":["abc","def"]}]')).toEqual({
      ok: true,
      output: '{\n  "foo": [\n    "bar",\n    [\n      "abc",\n      "def"\n    ]\n  ]\n}',
    });
  });
  it('applies a replace operation', () => {
    const result = testJsonPatch('{"a":1}', '[{"op":"replace","path":"/a","value":2}]');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 2 }, null, 2) });
  });

  it('applies an add operation', () => {
    const result = testJsonPatch('{"a":1}', '[{"op":"add","path":"/b","value":2}]');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 1, b: 2 }, null, 2) });
  });

  it('applies a remove operation', () => {
    const result = testJsonPatch('{"a":1,"b":2}', '[{"op":"remove","path":"/b"}]');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 1 }, null, 2) });
  });

  it('applies multiple operations in order', () => {
    const result = testJsonPatch(
      '{"a":1}',
      '[{"op":"add","path":"/b","value":2},{"op":"replace","path":"/a","value":9}]',
    );

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 9, b: 2 }, null, 2) });
  });

  it('fails a test operation that does not match', () => {
    const result = testJsonPatch('{"a":1}', '[{"op":"test","path":"/a","value":2}]');

    expect(result.ok).toBe(false);
  });

  it('rejects empty document or patch input', () => {
    expect(testJsonPatch('', '[]').ok).toBe(false);
    expect(testJsonPatch('{}', '   ').ok).toBe(false);
  });

  it('rejects a patch that is not a JSON array', () => {
    const result = testJsonPatch('{}', '{"op":"add"}');

    expect(result).toEqual({ ok: false, error: { message: 'patch must be a JSON array of operations.' } });
  });

  it('reports a parse error for malformed JSON', () => {
    const result = testJsonPatch('{"a": }', '[]');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.startsWith('document is invalid JSON')).toBe(true);
  });

  it('reports an error for an invalid patch operation path', () => {
    const result = testJsonPatch('{"a":1}', '[{"op":"replace","path":"/missing/deep","value":1}]');

    expect(result.ok).toBe(false);
  });
});
