import fc from 'fast-check';
import Papa from 'papaparse';
import { convertCsvSql } from "./csv-sql-transform.js";

describe('convertCsvSql', () => {
  it('converts CSV rows to INSERT statements', () => {
    const result = convertCsvSql('id,name\n1,Alice\n2,Bob\n', 'csv-to-sql', 'users');

    expect(result).toEqual({
      ok: true,
      output: "INSERT INTO users (id, name) VALUES (1, 'Alice');\nINSERT INTO users (id, name) VALUES (2, 'Bob');",
    });
  });

  it('defaults the table name to "table" when blank', () => {
    const result = convertCsvSql('id\n1\n', 'csv-to-sql', '');

    expect(result).toEqual({ ok: true, output: 'INSERT INTO table (id) VALUES (1);' });
  });

  it('quotes and escapes embedded single quotes', () => {
    const result = convertCsvSql("name\nO'Brien\n", 'csv-to-sql', 'people');

    expect(result).toEqual({ ok: true, output: "INSERT INTO people (name) VALUES ('O''Brien');" });
  });

  it('emits NULL for empty cells', () => {
    const result = convertCsvSql('id,note\n1,\n', 'csv-to-sql', 't');

    expect(result).toEqual({ ok: true, output: 'INSERT INTO t (id, note) VALUES (1, NULL);' });
  });

  it('rejects CSV with no data rows', () => {
    const result = convertCsvSql('id,name\n', 'csv-to-sql', 't');

    expect(result).toEqual({ ok: false, error: { message: 'No data rows found below the header.' } });
  });

  it('rejects empty CSV input', () => {
    expect(convertCsvSql('', 'csv-to-sql', 't').ok).toBe(false);
  });

  it('parses INSERT statements back into CSV', () => {
    const sql = "INSERT INTO users (id, name) VALUES (1, 'Alice');\nINSERT INTO users (id, name) VALUES (2, 'Bob');";
    const result = convertCsvSql(sql, 'sql-to-csv', 't');

    expect(result).toEqual({ ok: true, output: 'id,name\n1,Alice\n2,Bob' });
  });

  it('unescapes doubled single quotes and unquotes NULL when parsing SQL', () => {
    const sql = "INSERT INTO t (name, note) VALUES ('O''Brien', NULL);";
    const result = convertCsvSql(sql, 'sql-to-csv', 't');

    expect(result).toEqual({ ok: true, output: 'name,note\nO\'Brien,' });
  });

  it('respects commas embedded inside a quoted SQL value', () => {
    const sql = "INSERT INTO t (id, note) VALUES (1, 'a, b');";
    const result = convertCsvSql(sql, 'sql-to-csv', 't');

    expect(result).toEqual({ ok: true, output: 'id,note\n1,"a, b"' });
  });

  it('rejects SQL input with no INSERT statements', () => {
    const result = convertCsvSql('SELECT * FROM t;', 'sql-to-csv', 't');

    expect(result).toEqual({ ok: false, error: { message: 'No INSERT INTO ... VALUES (...) statements found.' } });
  });

  it('rejects empty SQL input', () => {
    expect(convertCsvSql('', 'sql-to-csv', 't').ok).toBe(false);
  });

  it('converts a JSON array of objects to INSERT statements', () => {
    const json = JSON.stringify([
      { id: 1, name: 'Alice', active: true },
      { id: 2, name: 'Bob', active: false },
    ]);
    const result = convertCsvSql(json, 'json-to-sql', 'users');

    expect(result).toEqual({
      ok: true,
      output:
        "INSERT INTO users (id, name, active) VALUES (1, 'Alice', TRUE);\n" +
        "INSERT INTO users (id, name, active) VALUES (2, 'Bob', FALSE);",
    });
  });

  it('emits NULL for a null JSON value', () => {
    const result = convertCsvSql(JSON.stringify([{ id: 1, note: null }]), 'json-to-sql', 't');
    expect(result).toEqual({ ok: true, output: 'INSERT INTO t (id, note) VALUES (1, NULL);' });
  });

  it('rejects a JSON array of non-objects', () => {
    expect(convertCsvSql('[1, 2, 3]', 'json-to-sql', 't').ok).toBe(false);
  });

  it('rejects invalid JSON', () => {
    expect(convertCsvSql('not json', 'json-to-sql', 't').ok).toBe(false);
  });

  it('rejects empty JSON input', () => {
    expect(convertCsvSql('', 'json-to-sql', 't').ok).toBe(false);
  });

  it('round-trips CSV -> SQL -> CSV', () => {
    const csv = 'id,name\n1,Alice\n2,Bob\n';
    const toSql = convertCsvSql(csv, 'csv-to-sql', 'users');
    expect(toSql.ok).toBe(true);

    const backToCsv = toSql.ok ? convertCsvSql(toSql.output, 'sql-to-csv', 'users') : null;
    expect(backToCsv).toEqual({ ok: true, output: 'id,name\n1,Alice\n2,Bob' });
  });
});

describe('round-trip property (DUDE_PRD.md §21 Phase 23 Item 4)', () => {
  // Non-numeric-looking cell values only (see NUMERIC in csv-sql-transform.ts): a value that
  // round-trips through SQL as an unquoted numeric literal loses the distinction between "1" and
  // "1.0", which is a documented, deliberate lossy conversion, not a bug this property should
  // flag.
  const cellValue = fc.string().filter((s) => !/^-?\d+(\.\d+)?$/.test(s));

  it('csv-to-sql -> sql-to-csv recovers the original cells for generated single-row CSV', () => {
    fc.assert(
      fc.property(cellValue, cellValue, (a, b) => {
        const csv = Papa.unparse([['col_a', 'col_b'], [a, b]], { newline: '\n' });
        const toSql = convertCsvSql(csv, 'csv-to-sql', 't');
        expect(toSql.ok).toBe(true);
        if (!toSql.ok) return;

        const backToCsv = convertCsvSql(toSql.output, 'sql-to-csv', 't');
        expect(backToCsv).toEqual({ ok: true, output: Papa.unparse([['col_a', 'col_b'], [a, b]], { newline: '\n' }) });
      }),
    );
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input, in any direction', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom<'csv-to-sql' | 'sql-to-csv' | 'json-to-sql'>('csv-to-sql', 'sql-to-csv', 'json-to-sql'), (input, direction) => {
        expect(() => convertCsvSql(input, direction, 't')).not.toThrow();
      }),
    );
  });
});
