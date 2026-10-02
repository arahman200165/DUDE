import { ASCII_TABLE } from "./ascii-table-data.js";
import { filterAsciiTable } from "./ascii-table-search.js";

describe('ASCII_TABLE', () => {
  it('has exactly 128 entries', () => {
    expect(ASCII_TABLE).toHaveLength(128);
  });

  it('labels control codes correctly', () => {
    expect(ASCII_TABLE[0]).toMatchObject({ decimal: 0, name: 'NUL', category: 'Control' });
    expect(ASCII_TABLE[7]).toMatchObject({ decimal: 7, name: 'BEL', category: 'Control' });
    expect(ASCII_TABLE[31]).toMatchObject({ decimal: 31, name: 'US', category: 'Control' });
  });

  it('labels space and delete', () => {
    expect(ASCII_TABLE[32]).toMatchObject({ category: 'Space' });
    expect(ASCII_TABLE[127]).toMatchObject({ category: 'Delete' });
  });

  it('produces the correct printable character', () => {
    expect(ASCII_TABLE[65].char).toBe('A');
    expect(ASCII_TABLE[97].char).toBe('a');
    expect(ASCII_TABLE[126].char).toBe('~');
  });

  it('formats hex and octal correctly', () => {
    expect(ASCII_TABLE[65]).toMatchObject({ hex: '0x41', octal: '101' });
  });
});

describe('filterAsciiTable', () => {
  it('returns everything for an empty filter', () => {
    expect(filterAsciiTable(ASCII_TABLE, '')).toHaveLength(128);
  });

  it('filters by character', () => {
    const result = filterAsciiTable(ASCII_TABLE, 'A');
    expect(result.some((e) => e.decimal === 65)).toBe(true);
  });

  it('filters by decimal', () => {
    const result = filterAsciiTable(ASCII_TABLE, '65');
    expect(result.some((e) => e.decimal === 65)).toBe(true);
  });

  it('filters by name substring, case-insensitively', () => {
    const result = filterAsciiTable(ASCII_TABLE, 'bel');
    expect(result).toHaveLength(1);
    expect(result[0].decimal).toBe(7);
  });
});
