import { computeCsvStats } from "./csv-stats-compute.js";

describe('computeCsvStats', () => {
  it('computes count, empty, distinct, and numeric min/max/mean per column', () => {
    const result = computeCsvStats('id,name,score\n1,Alice,90\n2,Bob,\n3,Alice,80\n');

    expect(result).toEqual({
      ok: true,
      table: {
        columns: ['Column', 'Count', 'Empty', 'Distinct', 'Min', 'Max', 'Mean'],
        rows: [
          ['id', '3', '0', '3', '1', '3', '2.00'],
          ['name', '3', '0', '2', '', '', ''],
          ['score', '3', '1', '2', '80', '90', '85.00'],
        ],
      },
    });
  });

  it('leaves min/max/mean empty for a non-numeric column', () => {
    const result = computeCsvStats('label\nfoo\nbar\n');

    expect(result.ok && result.table.rows[0]).toEqual(['label', '2', '0', '2', '', '', '']);
  });

  it('leaves min/max/mean empty when every value in a column is empty', () => {
    const result = computeCsvStats('a,b\n1,\n2,\n');

    expect(result.ok && result.table.rows[1]).toEqual(['b', '2', '2', '0', '', '', '']);
  });

  it('trims whitespace before counting empty/distinct', () => {
    const result = computeCsvStats('a\n" "\nx\n');

    expect(result.ok && result.table.rows[0]).toEqual(['a', '2', '1', '1', '', '', '']);
  });

  it('rejects empty input', () => {
    expect(computeCsvStats('').ok).toBe(false);
  });

  it('rejects a CSV with no data rows', () => {
    const result = computeCsvStats('a,b\n');

    expect(result).toEqual({ ok: false, error: { message: 'No data rows found below the header.' } });
  });
});
