import { sortJsonKeys } from "./json-sort-keys-transform.js";

describe('sortJsonKeys', () => {
  it('sorts top-level keys ascending', () => {
    const result = sortJsonKeys('{"c":1,"a":2,"b":3}', false, 'asc');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 2, b: 3, c: 1 }, null, 2) });
  });

  it('sorts top-level keys descending', () => {
    const result = sortJsonKeys('{"a":1,"c":2,"b":3}', false, 'desc');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ c: 2, b: 3, a: 1 }, null, 2) });
  });

  it('leaves nested objects untouched when not recursive', () => {
    const result = sortJsonKeys('{"b":{"z":1,"a":2},"a":1}', false, 'asc');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 1, b: { z: 1, a: 2 } }, null, 2) });
  });

  it('recursively sorts nested object keys', () => {
    const result = sortJsonKeys('{"b":{"z":1,"a":2},"a":1}', true, 'asc');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 1, b: { a: 2, z: 1 } }, null, 2) });
  });

  it('recursively sorts objects nested inside arrays', () => {
    const result = sortJsonKeys('[{"b":1,"a":2}]', true, 'asc');

    expect(result).toEqual({ ok: true, output: JSON.stringify([{ a: 2, b: 1 }], null, 2) });
  });

  it('leaves a top-level array of scalars unchanged', () => {
    const result = sortJsonKeys('[3,1,2]', true, 'asc');

    expect(result).toEqual({ ok: true, output: JSON.stringify([3, 1, 2], null, 2) });
  });

  it('rejects empty input', () => {
    expect(sortJsonKeys('', false, 'asc').ok).toBe(false);
  });

  it('reports a parse error for malformed JSON', () => {
    const result = sortJsonKeys('{"a": }', false, 'asc');
    expect(result.ok).toBe(false);
  });
});
