import { diffSchemas } from "./schema-diff-logic.js";
import { loadSqlParser, type SqlDialect, type SqlParser } from "../../shared/sql/sql-parser.js";

const parsers = {} as Record<SqlDialect, SqlParser>;
beforeAll(async () => {
  for (const id of ['postgresql', 'mysql', 'mariadb', 'sqlite', 'transactsql'] as const) parsers[id] = await loadSqlParser(id);
});

describe('diffSchemas', () => {
  it('reports no differences for identical schemas', () => {
    const sql = 'CREATE TABLE users (id INT NOT NULL, name VARCHAR(255))';
    const result = diffSchemas(parsers.postgresql, sql, sql, 'postgresql');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff.summary).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it('detects an added column', () => {
    const before = 'CREATE TABLE users (id INT NOT NULL)';
    const after = 'CREATE TABLE users (id INT NOT NULL, email VARCHAR(255))';
    const result = diffSchemas(parsers.postgresql, before, after, 'postgresql');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diff.summary.added).toBe(1);
    expect(result.diff.entries.some((entry) => entry.path === '/email')).toBe(true);
  });

  it('detects a removed column', () => {
    const before = 'CREATE TABLE users (id INT NOT NULL, email VARCHAR(255))';
    const after = 'CREATE TABLE users (id INT NOT NULL)';
    const result = diffSchemas(parsers.postgresql, before, after, 'postgresql');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff.summary.removed).toBe(1);
  });

  it('detects a changed column type', () => {
    const before = 'CREATE TABLE users (id INT NOT NULL)';
    const after = 'CREATE TABLE users (id VARCHAR(255) NOT NULL)';
    const result = diffSchemas(parsers.postgresql, before, after, 'postgresql');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff.summary.changed).toBe(1);
  });

  it('detects a nullability change', () => {
    const before = 'CREATE TABLE users (id INT NOT NULL)';
    const after = 'CREATE TABLE users (id INT)';
    const result = diffSchemas(parsers.postgresql, before, after, 'postgresql');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff.summary.changed).toBe(1);
  });

  it('rejects a non-CREATE-TABLE statement', () => {
    const result = diffSchemas(parsers.postgresql, 'SELECT * FROM users', 'CREATE TABLE users (id INT)', 'postgresql');
    expect(result.ok).toBe(false);
  });

  it('rejects empty input with a "Before:"/"After:" prefix', () => {
    const result = diffSchemas(parsers.postgresql, '', 'CREATE TABLE users (id INT)', 'postgresql');
    expect(result).toEqual({ ok: false, error: 'Before: Enter a CREATE TABLE statement.' });
  });
});
