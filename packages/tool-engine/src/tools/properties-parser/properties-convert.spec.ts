import { convertProperties } from "./properties-convert.js";

describe('convertProperties', () => {
  it('parses simple key=value pairs', () => {
    const result = convertProperties('a=1\nb=two\n', 'properties-to-json');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: '1', b: 'two' }, null, 2) });
  });

  it('supports ":" and bare whitespace as separators', () => {
    const result = convertProperties('a: 1\nb two\n', 'properties-to-json');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: '1', b: 'two' }, null, 2) });
  });

  it('skips "#" and "!" comment lines and blank lines', () => {
    const result = convertProperties('# a comment\n! also a comment\n\na=1\n', 'properties-to-json');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: '1' }, null, 2) });
  });

  it('joins backslash-continued lines', () => {
    const result = convertProperties('a=one \\\n  two\n', 'properties-to-json');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 'one two' }, null, 2) });
  });

  it('unescapes \\n, \\t, and \\uXXXX escapes', () => {
    const result = convertProperties('a=line1\\nline2\\tend\\u0041\n', 'properties-to-json');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 'line1\nline2\tendA' }, null, 2) });
  });

  it('unescapes an escaped separator inside a key', () => {
    const result = convertProperties('a\\=b=value\n', 'properties-to-json');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ 'a=b': 'value' }, null, 2) });
  });

  it('last value wins for a duplicate key', () => {
    const result = convertProperties('a=1\na=2\n', 'properties-to-json');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: '2' }, null, 2) });
  });

  it('formats a flat JSON object as .properties, escaping separators and leading spaces in keys', () => {
    const result = convertProperties(JSON.stringify({ 'a=b': 'x', c: 1, d: true }), 'json-to-properties');

    expect(result).toEqual({ ok: true, output: 'a\\=b=x\nc=1\nd=true\n' });
  });

  it('escapes newlines and tabs when formatting a value', () => {
    const result = convertProperties(JSON.stringify({ a: 'line1\nline2\tend' }), 'json-to-properties');

    expect(result).toEqual({ ok: true, output: 'a=line1\\nline2\\tend\n' });
  });

  it('rejects empty input for either direction', () => {
    expect(convertProperties('', 'properties-to-json').ok).toBe(false);
    expect(convertProperties('   ', 'json-to-properties').ok).toBe(false);
  });

  it('reports a parse error for malformed JSON', () => {
    const result = convertProperties('{"a": }', 'json-to-properties');

    expect(result.ok).toBe(false);
  });

  it('rejects a non-object top-level JSON value', () => {
    const result = convertProperties('[1,2]', 'json-to-properties');

    expect(result).toEqual({ ok: false, error: { message: 'Top-level JSON must be a flat object to convert to .properties.' } });
  });

  it('rejects a nested object value, suggesting flatten first', () => {
    const result = convertProperties(JSON.stringify({ a: { b: 1 } }), 'json-to-properties');

    expect(result).toEqual({
      ok: false,
      error: { message: 'Value for "a" must be a string, number, or boolean — flatten nested JSON first.' },
    });
  });

  it('round-trips a simple object', () => {
    const json = JSON.stringify({ name: 'DUDE', version: '1' });
    const toProps = convertProperties(json, 'json-to-properties');
    expect(toProps.ok).toBe(true);

    const backToJson = toProps.ok ? convertProperties(toProps.output, 'properties-to-json') : null;
    expect(backToJson).toEqual({ ok: true, output: JSON.stringify(JSON.parse(json), null, 2) });
  });
});
