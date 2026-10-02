import { pivotCsv } from "./csv-pivot-transform.js";

describe('pivotCsv', () => {
  const csv = 'region,product,amount\nEast,A,10\nEast,A,20\nEast,B,5\nWest,A,7\n';

  it('sums a numeric value column, grouped by row and column keys', () => {
    const result = pivotCsv(csv, 'region', 'product', 'amount', 'sum');

    expect(result).toEqual({
      ok: true,
      table: {
        columns: ['region', 'A', 'B'],
        rows: [
          ['East', '30', '5'],
          ['West', '7', ''],
        ],
      },
    });
  });

  it('counts rows per group regardless of numeric-ness', () => {
    const result = pivotCsv(csv, 'region', 'product', 'amount', 'count');

    expect(result).toEqual({
      ok: true,
      table: {
        columns: ['region', 'A', 'B'],
        rows: [
          ['East', '2', '1'],
          ['West', '1', ''],
        ],
      },
    });
  });

  it('averages a numeric value column per group', () => {
    const result = pivotCsv(csv, 'region', 'product', 'amount', 'avg');

    expect(result).toEqual({
      ok: true,
      table: {
        columns: ['region', 'A', 'B'],
        rows: [
          ['East', '15', '5'],
          ['West', '7', ''],
        ],
      },
    });
  });

  it('treats a non-numeric value as 0 for sum/avg but still counts it', () => {
    const result = pivotCsv('region,product,amount\nEast,A,x\n', 'region', 'product', 'amount', 'avg');

    expect(result).toEqual({ ok: true, table: { columns: ['region', 'A'], rows: [['East', '0']] } });
  });

  it('rejects empty input', () => {
    expect(pivotCsv('', 'a', 'b', 'c', 'sum').ok).toBe(false);
  });

  it('rejects an empty row/column/value key', () => {
    expect(pivotCsv(csv, '', 'product', 'amount', 'sum').ok).toBe(false);
    expect(pivotCsv(csv, 'region', '', 'amount', 'sum').ok).toBe(false);
    expect(pivotCsv(csv, 'region', 'product', '', 'sum').ok).toBe(false);
  });

  it('reports an error naming an unknown column', () => {
    const result = pivotCsv(csv, 'missing', 'product', 'amount', 'sum');

    expect(result).toEqual({ ok: false, error: { message: 'The row key column "missing" was not found in the header.' } });
  });
});
