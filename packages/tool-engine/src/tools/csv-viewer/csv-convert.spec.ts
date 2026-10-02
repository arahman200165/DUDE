import { convertCsv, csvToJson, jsonToCsv, parseCsv } from "./csv-convert.js";

describe('parseCsv', () => {
  it('parses RFC 4180 section 2 published records and quoting examples', () => {
    expect(parseCsv('field_name,field_name,field_name\r\naaa,bbb,ccc\r\nzzz,yyy,xxx', ',', true)).toEqual({
      ok: true,
      table: { columns: ['field_name', 'field_name', 'field_name'], rows: [['aaa', 'bbb', 'ccc'], ['zzz', 'yyy', 'xxx']] },
    });
    expect(parseCsv('a,"b,b",c\r\n"d","e\r\nf","g"', ',', false)).toEqual({
      ok: true,
      table: { columns: ['Column 1', 'Column 2', 'Column 3'], rows: [['a', 'b,b', 'c'], ['d', 'e\r\nf', 'g']] },
    });
    expect(parseCsv('"aaa","b""bb","ccc"', ',', false)).toEqual({
      ok: true,
      table: { columns: ['Column 1', 'Column 2', 'Column 3'], rows: [['aaa', 'b"bb', 'ccc']] },
    });
  });
  it('parses a CSV table with a header row', () => {
    const result = parseCsv('name,age\nAlice,30\nBob,25', ',', true);

    expect(result).toEqual({
      ok: true,
      table: { columns: ['name', 'age'], rows: [['Alice', '30'], ['Bob', '25']] },
    });
  });

  it('generates column labels when there is no header row', () => {
    const result = parseCsv('Alice,30\nBob,25', ',', false);

    expect(result).toEqual({
      ok: true,
      table: { columns: ['Column 1', 'Column 2'], rows: [['Alice', '30'], ['Bob', '25']] },
    });
  });

  it('respects a semicolon delimiter', () => {
    const result = parseCsv('a;b\n1;2', ';', true);
    expect(result).toEqual({ ok: true, table: { columns: ['a', 'b'], rows: [['1', '2']] } });
  });

  it('handles quoted fields containing the delimiter', () => {
    const result = parseCsv('name,city\nAlice,"New York, NY"', ',', true);
    expect(result).toEqual({ ok: true, table: { columns: ['name', 'city'], rows: [['Alice', 'New York, NY']] } });
  });

  it('rejects empty input', () => {
    expect(parseCsv('', ',', true).ok).toBe(false);
    expect(parseCsv('   ', ',', true).ok).toBe(false);
  });

  it('reports an error for an unterminated quoted field', () => {
    const result = parseCsv('a,b\n"unterminated,2', ',', true);
    expect(result.ok).toBe(false);
  });
});

describe('csvToJson', () => {
  it('converts a header-row CSV into an array of objects', () => {
    const result = csvToJson('name,age\nAlice,30', ',', true);
    expect(result).toEqual({ ok: true, output: JSON.stringify([{ name: 'Alice', age: '30' }], null, 2) });
  });

  it('converts a headerless CSV into an array of arrays', () => {
    const result = csvToJson('Alice,30', ',', false);
    expect(result).toEqual({ ok: true, output: JSON.stringify([['Alice', '30']], null, 2) });
  });
});

describe('jsonToCsv', () => {
  it('converts an array of objects into CSV with a header row', () => {
    const result = jsonToCsv('[{"name":"Alice","age":30}]', ',');
    expect(result).toEqual({ ok: true, output: 'name,age\nAlice,30' });
  });

  it('rejects non-array JSON', () => {
    const result = jsonToCsv('{"name":"Alice"}', ',');
    expect(result.ok).toBe(false);
  });

  it('rejects malformed JSON', () => {
    const result = jsonToCsv('{"name":}', ',');
    expect(result.ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(jsonToCsv('', ',').ok).toBe(false);
  });
});

describe('convertCsv', () => {
  it('dispatches to csvToJson for the csv-to-json direction', () => {
    expect(convertCsv('a,b\n1,2', 'csv-to-json', ',', true)).toEqual(csvToJson('a,b\n1,2', ',', true));
  });

  it('dispatches to jsonToCsv for the json-to-csv direction', () => {
    expect(convertCsv('[{"a":1}]', 'json-to-csv', ',', true)).toEqual(jsonToCsv('[{"a":1}]', ','));
  });
});
