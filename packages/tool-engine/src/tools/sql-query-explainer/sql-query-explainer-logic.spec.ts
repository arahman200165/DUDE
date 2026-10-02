import fc from 'fast-check';
import { explainSqlQuery, SQL_EXPLAINER_DIALECTS } from "./sql-query-explainer-logic.js";

describe('explainSqlQuery', () => {
  it('explains a simple SELECT with a WHERE clause', () => {
    const result = explainSqlQuery('SELECT a, b FROM t WHERE x = 1', 'postgresql');
    expect(result).toEqual({
      ok: true,
      lines: ['Selects: a, b.', 'From: t.', 'Filters rows where: x = 1.'],
    });
  });

  it('explains SELECT *', () => {
    const result = explainSqlQuery('SELECT * FROM t', 'postgresql');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lines[0]).toBe('Selects all columns (*).');
  });

  it('explains a full query with JOIN, GROUP BY, HAVING, ORDER BY, and LIMIT', () => {
    const result = explainSqlQuery(
      'SELECT a, COUNT(b) AS cnt FROM t1 JOIN t2 ON t1.id = t2.t1_id WHERE t1.x > 5 GROUP BY a HAVING COUNT(b) > 1 ORDER BY a DESC LIMIT 10',
      'postgresql',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toEqual([
      'Selects: a, COUNT(b) (as cnt).',
      'From: t1.',
      'INNER JOIN t2 on "t1".id = "t2".t1_id.',
      'Filters rows where: "t1".x > 5.',
      'Groups by: a.',
      'Filters groups where: COUNT(b) > 1.',
      'Orders by: a DESC.',
      'Limits the result to 10 row(s).',
    ]);
  });

  it('rejects a non-SELECT statement', () => {
    const result = explainSqlQuery('DELETE FROM t WHERE x = 1', 'postgresql');
    expect(result.ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(explainSqlQuery('', 'postgresql').ok).toBe(false);
  });

  it('rejects invalid SQL', () => {
    expect(explainSqlQuery('SELECT FROM WHERE', 'postgresql').ok).toBe(false);
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input, in any dialect', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom(...SQL_EXPLAINER_DIALECTS.map((d) => d.id)), (sql, dialect) => {
        expect(() => explainSqlQuery(sql, dialect)).not.toThrow();
      }),
    );
  });

  // A corpus of varied real SELECT shapes -- pure random strings almost never produce SQL that
  // parses at all, so this is what actually exercises the post-parse rendering path (where the
  // real bug this milestone fixed was hiding).
  const VALID_SELECT_CORPUS = [
    'SELECT * FROM users',
    'SELECT id, name AS n FROM users WHERE age > 18',
    'SELECT a.id FROM a JOIN b ON a.id = b.id LEFT JOIN c ON b.id = c.id',
    'SELECT dept, COUNT(*) FROM emp GROUP BY dept HAVING COUNT(*) > 1',
    'SELECT * FROM t ORDER BY a ASC, b DESC LIMIT 10',
    'SELECT CASE WHEN a > 1 THEN 1 ELSE 0 END FROM t',
    'SELECT * FROM (SELECT id FROM users) sub',
    'WITH cte AS (SELECT id FROM users) SELECT * FROM cte',
    'SELECT * FROM t1 UNION SELECT * FROM t2',
    'SELECT COUNT(*) OVER (PARTITION BY dept ORDER BY id) FROM emp',
  ];

  it('never throws for a corpus of varied valid SELECT statements, in any dialect', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_SELECT_CORPUS),
        fc.constantFrom(...SQL_EXPLAINER_DIALECTS.map((d) => d.id)),
        (sql, dialect) => {
          expect(() => explainSqlQuery(sql, dialect)).not.toThrow();
        },
      ),
    );
  });
});
