import { repairJson } from "./json-repair.js";

describe('repairJson', () => {
  it('removes trailing commas', () => {
    const result = repairJson('{"a": 1, "b": 2,}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.parse(result.repaired)).toEqual({ a: 1, b: 2 });
  });

  it('quotes unquoted keys', () => {
    const result = repairJson('{a: 1, b: 2}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.parse(result.repaired)).toEqual({ a: 1, b: 2 });
  });

  it('converts single-quoted strings to double-quoted', () => {
    const result = repairJson("{'a': 'hello'}");
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.parse(result.repaired)).toEqual({ a: 'hello' });
  });

  it('strips comments', () => {
    const result = repairJson('{\n// a comment\n"a": 1\n}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.parse(result.repaired)).toEqual({ a: 1 });
  });

  it('reports an error for input that cannot be repaired', () => {
    const result = repairJson('');
    expect(result.ok).toBe(false);
  });
});
