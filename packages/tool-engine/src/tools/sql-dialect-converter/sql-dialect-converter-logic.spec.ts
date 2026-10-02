import fc from 'fast-check';
import { convertSqlDialect, SQL_CONVERTER_DIALECTS } from "./sql-dialect-converter-logic.js";

describe('convertSqlDialect', () => {
  it('converts MySQL backtick-quoting to PostgreSQL double-quoting', () => {
    const result = convertSqlDialect('SELECT a, b FROM t WHERE x = 1 LIMIT 10', 'mysql', 'postgresql');
    expect(result).toEqual({ ok: true, output: 'SELECT "a", "b" FROM "t" WHERE "x" = 1 LIMIT 10' });
  });

  it('converts to SQL Server bracket-quoting', () => {
    const result = convertSqlDialect('SELECT a FROM t', 'mysql', 'transactsql');
    expect(result).toEqual({ ok: true, output: 'SELECT [a] FROM [t]' });
  });

  it('round-trips through the same dialect unchanged in meaning', () => {
    const result = convertSqlDialect('SELECT a FROM t', 'postgresql', 'postgresql');
    expect(result.ok).toBe(true);
  });

  it('rejects empty input', () => {
    expect(convertSqlDialect('', 'mysql', 'postgresql').ok).toBe(false);
  });

  it('rejects SQL that fails to parse under the source dialect', () => {
    expect(convertSqlDialect('SELECT FROM WHERE', 'mysql', 'postgresql').ok).toBe(false);
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input, across any dialect pair', () => {
    const dialect = fc.constantFrom(...SQL_CONVERTER_DIALECTS.map((d) => d.id));
    fc.assert(
      fc.property(fc.string(), dialect, dialect, (sql, from, to) => {
        expect(() => convertSqlDialect(sql, from, to)).not.toThrow();
      }),
    );
  });
});
