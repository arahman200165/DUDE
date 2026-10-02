import { filterSortCsv } from "./csv-filter-sort-transform.js";

describe('filterSortCsv', () => {
  const csv = 'name,age\nAlice,30\nBob,25\nCarol,40\n';

  it('filters rows with "contains" (case-insensitive)', () => {
    const result = filterSortCsv(csv, 'name', 'contains', 'ali', '', 'asc');

    expect(result).toEqual({ ok: true, table: { columns: ['name', 'age'], rows: [['Alice', '30']] } });
  });

  it('filters rows with "equals"', () => {
    const result = filterSortCsv(csv, 'name', 'equals', 'Bob', '', 'asc');

    expect(result).toEqual({ ok: true, table: { columns: ['name', 'age'], rows: [['Bob', '25']] } });
  });

  it('filters rows with "not-empty"', () => {
    const result = filterSortCsv('name,note\nAlice,\nBob,x\n', 'note', 'not-empty', '', '', 'asc');

    expect(result).toEqual({ ok: true, table: { columns: ['name', 'note'], rows: [['Bob', 'x']] } });
  });

  it('filters rows with numeric "gt" and "lt"', () => {
    expect(filterSortCsv(csv, 'age', 'gt', '28', '', 'asc')).toEqual({
      ok: true,
      table: { columns: ['name', 'age'], rows: [['Alice', '30'], ['Carol', '40']] },
    });
    expect(filterSortCsv(csv, 'age', 'lt', '28', '', 'asc')).toEqual({
      ok: true,
      table: { columns: ['name', 'age'], rows: [['Bob', '25']] },
    });
  });

  it('sorts numerically ascending and descending when every value is numeric', () => {
    expect(filterSortCsv(csv, '', 'contains', '', 'age', 'asc')).toEqual({
      ok: true,
      table: { columns: ['name', 'age'], rows: [['Bob', '25'], ['Alice', '30'], ['Carol', '40']] },
    });
    expect(filterSortCsv(csv, '', 'contains', '', 'age', 'desc')).toEqual({
      ok: true,
      table: { columns: ['name', 'age'], rows: [['Carol', '40'], ['Alice', '30'], ['Bob', '25']] },
    });
  });

  it('sorts lexicographically when values are not all numeric', () => {
    const result = filterSortCsv(csv, '', 'contains', '', 'name', 'asc');

    expect(result).toEqual({
      ok: true,
      table: { columns: ['name', 'age'], rows: [['Alice', '30'], ['Bob', '25'], ['Carol', '40']] },
    });
  });

  it('leaves order unchanged when no sort column is given', () => {
    const result = filterSortCsv(csv, '', 'contains', '', '', 'asc');

    expect(result.ok && result.table.rows.map((row) => row[0])).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('rejects empty input', () => {
    expect(filterSortCsv('', '', 'contains', '', '', 'asc').ok).toBe(false);
  });

  it('reports an error naming an unknown filter column', () => {
    const result = filterSortCsv(csv, 'missing', 'contains', 'x', '', 'asc');

    expect(result).toEqual({ ok: false, error: { message: 'The filter column "missing" was not found in the header.' } });
  });

  it('reports an error naming an unknown sort column', () => {
    const result = filterSortCsv(csv, '', 'contains', '', 'missing', 'asc');

    expect(result).toEqual({ ok: false, error: { message: 'The sort column "missing" was not found in the header.' } });
  });
});
