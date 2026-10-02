import { mergeJson } from "./json-merge-transform.js";

describe('mergeJson', () => {
  it('deep-merges nested objects, with overlay keys winning', () => {
    const result = mergeJson('{"a":1,"nested":{"x":1,"y":2}}', '{"b":2,"nested":{"y":3,"z":4}}', 'deep');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 1, nested: { x: 1, y: 3, z: 4 }, b: 2 }, null, 2) });
  });

  it('replaces arrays wholesale in deep-merge mode', () => {
    const result = mergeJson('{"tags":["a","b"]}', '{"tags":["c"]}', 'deep');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ tags: ['c'] }, null, 2) });
  });

  it('replaces scalars with the overlay value', () => {
    const result = mergeJson('{"a":1}', '{"a":2}', 'deep');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 2 }, null, 2) });
  });

  it('applies RFC 7396 JSON Merge Patch semantics, deleting keys set to null', () => {
    const result = mergeJson('{"a":1,"b":2}', '{"a":null,"c":3}', 'rfc7396');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ b: 2, c: 3 }, null, 2) });
  });

  it('recursively applies merge patch semantics to nested objects', () => {
    const result = mergeJson('{"nested":{"x":1,"y":2}}', '{"nested":{"y":null,"z":3}}', 'rfc7396');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ nested: { x: 1, z: 3 } }, null, 2) });
  });

  it('rejects empty base or overlay input', () => {
    expect(mergeJson('', '{}', 'deep').ok).toBe(false);
    expect(mergeJson('{}', '   ', 'deep').ok).toBe(false);
  });

  it('reports which side failed to parse', () => {
    const baseError = mergeJson('{"a": }', '{}', 'deep');
    expect(baseError.ok).toBe(false);
    expect(!baseError.ok && baseError.error.message.startsWith('base JSON is invalid')).toBe(true);

    const overlayError = mergeJson('{}', '{"a": }', 'deep');
    expect(overlayError.ok).toBe(false);
    expect(!overlayError.ok && overlayError.error.message.startsWith('overlay JSON is invalid')).toBe(true);
  });
});
