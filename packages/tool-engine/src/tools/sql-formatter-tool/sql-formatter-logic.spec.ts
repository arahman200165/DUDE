import fc from 'fast-check';
import { formatSql, SQL_DIALECTS } from "./sql-formatter-logic.js";

describe('formatSql', () => {
  it('pretty-prints SQL across multiple lines', () => {
    const result = formatSql('select a,b from t where x=1', 'postgresql', 'format');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.split('\n').length).toBeGreaterThan(1);
  });

  it('minifies SQL to a single line, collapsing whitespace', () => {
    const result = formatSql('select   a,\n b\nfrom   t', 'sql', 'minify');
    expect(result).toEqual({ ok: true, output: 'select a, b from t' });
  });

  it('preserves whitespace inside string literals when minifying', () => {
    const result = formatSql("select 'a   b' from t", 'sql', 'minify');
    expect(result).toEqual({ ok: true, output: "select 'a   b' from t" });
  });

  it('rejects empty input', () => {
    expect(formatSql('', 'sql', 'format').ok).toBe(false);
  });

  it('formats Oracle PL/SQL without error', () => {
    const result = formatSql('select * from dual', 'plsql', 'format');
    expect(result.ok).toBe(true);
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input, in any dialect/mode', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom(...SQL_DIALECTS.map((d) => d.id)),
        fc.constantFrom<'format' | 'minify'>('format', 'minify'),
        (sql, dialect, mode) => {
          expect(() => formatSql(sql, dialect, mode)).not.toThrow();
        },
      ),
    );
  });
});
