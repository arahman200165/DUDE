import { flattenJson } from "./json-flatten-transform.js";

describe('flattenJson', () => {
  it('flattens a nested object into dot/bracket-notation keys', () => {
    const result = flattenJson('{"a":{"b":1,"c":[2,3]}}', 'flatten');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ 'a.b': 1, 'a.c[0]': 2, 'a.c[1]': 3 }, null, 2) });
  });

  it('preserves empty objects and arrays as leaf values when flattening', () => {
    const result = flattenJson('{"a":{},"b":[]}', 'flatten');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: {}, b: [] }, null, 2) });
  });

  it('flattens a top-level array', () => {
    const result = flattenJson('[1,{"x":2}]', 'flatten');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ '[0]': 1, '[1].x': 2 }, null, 2) });
  });

  it('unflattens dot/bracket-notation keys back into nested JSON', () => {
    const flat = JSON.stringify({ 'a.b': 1, 'a.c[0]': 2, 'a.c[1]': 3 });
    const result = flattenJson(flat, 'unflatten');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: { b: 1, c: [2, 3] } }, null, 2) });
  });

  it('round-trips flatten then unflatten', () => {
    const original = { name: 'DUDE', tags: ['dev', 'tools'], nested: { deep: { value: true } } };
    const flat = flattenJson(JSON.stringify(original), 'flatten');
    expect(flat.ok).toBe(true);

    const back = flat.ok ? flattenJson(flat.output, 'unflatten') : null;
    expect(back).toEqual({ ok: true, output: JSON.stringify(original, null, 2) });
  });

  it('rejects empty input', () => {
    expect(flattenJson('', 'flatten').ok).toBe(false);
    expect(flattenJson('   ', 'unflatten').ok).toBe(false);
  });

  it('reports a parse error for malformed JSON', () => {
    const result = flattenJson('{"a": }', 'flatten');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });

  it('rejects a scalar top-level value when flattening', () => {
    const result = flattenJson('42', 'flatten');

    expect(result).toEqual({ ok: false, error: { message: 'Top-level JSON must be an object or array to flatten.' } });
  });

  it('rejects a non-object top-level value when unflattening', () => {
    const result = flattenJson('[1,2]', 'unflatten');

    expect(result).toEqual({ ok: false, error: { message: 'Top-level JSON must be a flat object of path keys to unflatten.' } });
  });
});
