import { formatUuidExport } from "./uuid-export.js";

const SAMPLE = ['550e8400-e29b-41d4-a716-446655440000', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'];

describe('formatUuidExport', () => {
  it('formats as newline-separated text', () => {
    expect(formatUuidExport(SAMPLE, 'txt')).toEqual({
      text: SAMPLE.join('\n'),
      filename: 'uuids.txt',
      mimeType: 'text/plain',
    });
  });

  it('formats as a JSON array', () => {
    const result = formatUuidExport(SAMPLE, 'json');
    expect(JSON.parse(result.text)).toEqual(SAMPLE);
    expect(result.filename).toBe('uuids.json');
    expect(result.mimeType).toBe('application/json');
  });

  it('formats as CSV with a header row', () => {
    const result = formatUuidExport(SAMPLE, 'csv');
    expect(result.text).toBe(['uuid', ...SAMPLE].join('\n'));
    expect(result.filename).toBe('uuids.csv');
    expect(result.mimeType).toBe('text/csv');
  });

  it('handles an empty list', () => {
    expect(formatUuidExport([], 'txt').text).toBe('');
    expect(formatUuidExport([], 'json').text).toBe('[]');
    expect(formatUuidExport([], 'csv').text).toBe('uuid');
  });
});
