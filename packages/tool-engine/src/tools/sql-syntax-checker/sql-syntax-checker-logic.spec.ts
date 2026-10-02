import fc from 'fast-check';
import { checkSqlSyntax, SQL_CHECKER_DIALECTS } from "./sql-syntax-checker-logic.js";

describe('checkSqlSyntax', () => {
  it('accepts valid SQL', () => {
    expect(checkSqlSyntax('SELECT a, b FROM t WHERE x = 1', 'postgresql')).toEqual({ ok: true });
  });

  it('rejects invalid SQL with a location', () => {
    const result = checkSqlSyntax('SELECT FROM WHERE', 'postgresql');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.location?.line).toBe(1);
  });

  it('rejects empty input', () => {
    expect(checkSqlSyntax('', 'postgresql')).toEqual({ ok: false, message: 'Enter some SQL.' });
  });

  it('checks against the selected dialect', () => {
    expect(checkSqlSyntax('SELECT TOP 10 * FROM t', 'transactsql').ok).toBe(true);
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input, in any dialect', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom(...SQL_CHECKER_DIALECTS.map((d) => d.id)), (sql, dialect) => {
        expect(() => checkSqlSyntax(sql, dialect)).not.toThrow();
      }),
    );
  });
});
