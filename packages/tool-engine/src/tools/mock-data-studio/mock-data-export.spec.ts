import { formatMockDataExport } from "./mock-data-export.js";

const ROWS = [
  { name: 'Ada Lovelace', age: 30 },
  { name: "O'Brien", age: 25 },
];

describe('formatMockDataExport', () => {
  it('exports JSON', () => {
    const result = formatMockDataExport(ROWS, 'json', 'people');
    expect(JSON.parse(result.text)).toEqual(ROWS);
    expect(result.filename).toBe('mock-data.json');
  });

  it('exports NDJSON, one row per line', () => {
    const result = formatMockDataExport(ROWS, 'ndjson', 'people');
    const lines = result.text.split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(ROWS[0]);
  });

  it('exports CSV with a header row', () => {
    const result = formatMockDataExport(ROWS, 'csv', 'people');
    expect(result.text.split('\r\n')[0]).toBe('name,age');
  });

  it('exports SQL INSERT statements with quote-escaping', () => {
    const result = formatMockDataExport(ROWS, 'sql', 'people');
    expect(result.text).toContain("INSERT INTO people (name, age) VALUES ('Ada Lovelace', 30);");
    expect(result.text).toContain("'O''Brien'");
  });

  it('exports XML with a row per record', () => {
    const result = formatMockDataExport(ROWS, 'xml', 'people');
    expect(result.text).toContain('<rows>');
    expect((result.text.match(/<row>/g) ?? []).length).toBe(2);
  });

  it('exports YAML', () => {
    const result = formatMockDataExport(ROWS, 'yaml', 'people');
    expect(result.text).toContain('name: Ada Lovelace');
  });
});
