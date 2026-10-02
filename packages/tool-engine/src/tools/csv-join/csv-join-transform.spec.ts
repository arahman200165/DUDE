import { joinCsv } from "./csv-join-transform.js";

describe('joinCsv', () => {
  const left = 'id,name\n1,Alice\n2,Bob\n3,Carol\n';
  const right = 'id,dept\n1,Eng\n2,Sales\n';

  it('inner-joins matching rows and drops the right key column', () => {
    const result = joinCsv(left, right, 'id', 'id', 'inner');

    expect(result).toEqual({
      ok: true,
      table: {
        columns: ['id', 'name', 'dept'],
        rows: [
          ['1', 'Alice', 'Eng'],
          ['2', 'Bob', 'Sales'],
        ],
      },
    });
  });

  it('left-joins, keeping unmatched left rows with empty right values', () => {
    const result = joinCsv(left, right, 'id', 'id', 'left');

    expect(result).toEqual({
      ok: true,
      table: {
        columns: ['id', 'name', 'dept'],
        rows: [
          ['1', 'Alice', 'Eng'],
          ['2', 'Bob', 'Sales'],
          ['3', 'Carol', ''],
        ],
      },
    });
  });

  it('prefixes a colliding right column name with right_', () => {
    const result = joinCsv('id,name\n1,Alice\n', 'id,name\n1,Smith\n', 'id', 'id', 'inner');

    expect(result).toEqual({
      ok: true,
      table: { columns: ['id', 'name', 'right_name'], rows: [['1', 'Alice', 'Smith']] },
    });
  });

  it('rejects empty left or right CSV input', () => {
    expect(joinCsv('', right, 'id', 'id', 'inner').ok).toBe(false);
    expect(joinCsv(left, '', 'id', 'id', 'inner').ok).toBe(false);
  });

  it('rejects an empty key column name', () => {
    expect(joinCsv(left, right, '', 'id', 'inner').ok).toBe(false);
    expect(joinCsv(left, right, 'id', '', 'inner').ok).toBe(false);
  });

  it('reports an error for an unknown left key column', () => {
    const result = joinCsv(left, right, 'missing', 'id', 'inner');

    expect(result).toEqual({ ok: false, error: { message: 'Column "missing" was not found in the left CSV header.' } });
  });

  it('reports an error for an unknown right key column', () => {
    const result = joinCsv(left, right, 'id', 'missing', 'inner');

    expect(result).toEqual({ ok: false, error: { message: 'Column "missing" was not found in the right CSV header.' } });
  });
});
