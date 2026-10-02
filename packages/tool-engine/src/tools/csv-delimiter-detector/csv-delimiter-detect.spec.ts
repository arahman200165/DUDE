import { detectCsvDelimiter } from "./csv-delimiter-detect.js";

describe('detectCsvDelimiter', () => {
  it('detects a comma-delimited sample', () => {
    const result = detectCsvDelimiter('a,b,c\n1,2,3\n');

    expect(result).toEqual({
      ok: true,
      delimiter: ',',
      label: 'Comma ( , )',
      table: { columns: ['a', 'b', 'c'], rows: [['1', '2', '3']] },
    });
  });

  it('detects a semicolon-delimited sample', () => {
    const result = detectCsvDelimiter('a;b;c\n1;2;3\n');

    expect(result).toEqual({
      ok: true,
      delimiter: ';',
      label: 'Semicolon ( ; )',
      table: { columns: ['a', 'b', 'c'], rows: [['1', '2', '3']] },
    });
  });

  it('detects a tab-delimited sample', () => {
    const result = detectCsvDelimiter('a\tb\tc\n1\t2\t3\n');

    expect(result).toEqual({
      ok: true,
      delimiter: '\t',
      label: 'Tab',
      table: { columns: ['a', 'b', 'c'], rows: [['1', '2', '3']] },
    });
  });

  it('detects a pipe-delimited sample', () => {
    const result = detectCsvDelimiter('a|b|c\n1|2|3\n');

    expect(result).toEqual({
      ok: true,
      delimiter: '|',
      label: 'Pipe ( | )',
      table: { columns: ['a', 'b', 'c'], rows: [['1', '2', '3']] },
    });
  });

  it('prefers the delimiter that gives a consistent field count across all lines', () => {
    // Semicolons appear inside values here, so only comma is consistent across both lines.
    const result = detectCsvDelimiter('a,b\n1;x,2;y\n');

    expect(result.ok).toBe(true);
    expect(result.ok && result.delimiter).toBe(',');
  });

  it('defaults to comma when no delimiter produces more than one field', () => {
    const result = detectCsvDelimiter('onlyonecolumn\nanothervalue\n');

    expect(result.ok).toBe(true);
    expect(result.ok && result.delimiter).toBe(',');
  });

  it('rejects empty input', () => {
    expect(detectCsvDelimiter('').ok).toBe(false);
    expect(detectCsvDelimiter('   \n  ').ok).toBe(false);
  });
});
