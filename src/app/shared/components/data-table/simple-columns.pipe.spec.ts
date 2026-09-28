import { SimpleColumnsPipe } from './simple-columns.pipe';

describe('SimpleColumnsPipe', () => {
  it('builds one positional column per header', () => {
    const columns = new SimpleColumnsPipe().transform(['Name', 'Uses']);
    expect(columns.map((c) => c.header)).toEqual(['Name', 'Uses']);
    expect(columns.map((c) => c.key)).toEqual(['0', '1']);
  });

  it('column values read the row by position', () => {
    const [nameColumn, usesColumn] = new SimpleColumnsPipe().transform(['Name', 'Uses']);
    const row = ['Base64', '9'];
    expect(nameColumn.value(row)).toBe('Base64');
    expect(usesColumn.value(row)).toBe('9');
  });

  it('is tolerant of a short row', () => {
    const [, usesColumn] = new SimpleColumnsPipe().transform(['Name', 'Uses']);
    expect(usesColumn.value(['Base64'])).toBe('');
  });
});
