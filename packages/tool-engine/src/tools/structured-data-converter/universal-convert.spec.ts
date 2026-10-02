import { convertStructuredData } from "./universal-convert.js";

describe('convertStructuredData', () => {
  it('converts JSON to YAML', () => {
    const result = convertStructuredData('{"a":1,"b":[2,3]}', 'json', 'yaml');

    expect(result).toEqual({ ok: true, output: 'a: 1\nb:\n  - 2\n  - 3\n' });
  });

  it('converts YAML to JSON', () => {
    const result = convertStructuredData('a: 1\nb:\n  - 2\n  - 3\n', 'yaml', 'json');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 1, b: [2, 3] }, null, 2) });
  });

  it('converts JSON to TOML', () => {
    const result = convertStructuredData('{"title":"x","owner":{"name":"Tom"}}', 'json', 'toml');

    expect(result).toEqual({ ok: true, output: 'title = "x"\n\n[owner]\nname = "Tom"\n' });
  });

  it('converts TOML to JSON', () => {
    const result = convertStructuredData('title = "x"\n[owner]\nname = "Tom"\n', 'toml', 'json');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ title: 'x', owner: { name: 'Tom' } }, null, 2) });
  });

  it('converts JSON to XML, using the single top-level object key as the root tag', () => {
    const result = convertStructuredData('{"root":{"a":1,"b":2}}', 'json', 'xml');

    expect(result).toEqual({ ok: true, output: '<root>\n  <a>1</a>\n  <b>2</b>\n</root>' });
  });

  it('wraps a JSON value with no single root key when converting to XML', () => {
    const result = convertStructuredData('{"a":1,"b":2}', 'json', 'xml');

    expect(result).toEqual({ ok: true, output: '<root>\n  <a>1</a>\n  <b>2</b>\n</root>' });
  });

  it('converts XML to JSON, keeping the root element as the sole top-level key', () => {
    const result = convertStructuredData('<root><a>1</a><b>2</b></root>', 'xml', 'json');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ root: { a: 1, b: 2 } }, null, 2) });
  });

  it('converts CSV to JSON as an array of row objects', () => {
    const result = convertStructuredData('a,b\n1,2\n3,4\n', 'csv', 'json');

    expect(result).toEqual({
      ok: true,
      output: JSON.stringify(
        [
          { a: '1', b: '2' },
          { a: '3', b: '4' },
        ],
        null,
        2,
      ),
    });
  });

  it('converts a JSON array of objects to CSV', () => {
    const result = convertStructuredData(JSON.stringify([{ a: '1', b: '2' }]), 'json', 'csv');

    expect(result).toEqual({ ok: true, output: 'a,b\n1,2' });
  });

  it('rejects converting a non-array JSON value to CSV', () => {
    const result = convertStructuredData('{"a":1}', 'json', 'csv');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.startsWith('Could not produce CSV')).toBe(true);
  });

  it('rejects empty input, naming the source format', () => {
    const result = convertStructuredData('', 'yaml', 'json');

    expect(result).toEqual({ ok: false, error: { message: 'Enter some YAML.' } });
  });

  it('reports a parse error naming the source format', () => {
    const result = convertStructuredData('{"a": }', 'json', 'yaml');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.startsWith('Could not parse JSON')).toBe(true);
  });

  it('round-trips JSON -> CSV -> JSON for a flat array of objects', () => {
    const original = [
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ];
    const toCsv = convertStructuredData(JSON.stringify(original), 'json', 'csv');
    expect(toCsv.ok).toBe(true);

    const backToJson = toCsv.ok ? convertStructuredData(toCsv.output, 'csv', 'json') : null;
    expect(backToJson).toEqual({ ok: true, output: JSON.stringify(original, null, 2) });
  });
});
