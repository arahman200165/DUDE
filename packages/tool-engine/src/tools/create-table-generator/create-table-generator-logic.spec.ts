import { generateCreateTable } from "./create-table-generator-logic.js";

const JSON_SAMPLE = JSON.stringify([
  { id: 1, name: 'Ada', active: true, joined: '2020-01-01', bio: null },
  { id: 2, name: 'Bob', active: false, joined: '2021-06-15', bio: 'hi' },
]);

describe('generateCreateTable', () => {
  it('infers integer, string, boolean, date, and nullable-string columns from JSON', () => {
    const result = generateCreateTable(JSON_SAMPLE, 'users', 'postgresql');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sql).toContain('CREATE TABLE "users" (');
    expect(result.sql).toContain('"id" INTEGER NOT NULL');
    expect(result.sql).toContain('"name" VARCHAR(255) NOT NULL');
    expect(result.sql).toContain('"active" BOOLEAN NOT NULL');
    expect(result.sql).toContain('"joined" TIMESTAMP NOT NULL');
    expect(result.sql).toContain('"bio" VARCHAR(255)');
    expect(result.sql).not.toContain('"bio" VARCHAR(255) NOT NULL');
  });

  it('infers columns from a CSV sample', () => {
    const result = generateCreateTable('id,name\n1,Ada\n2,Bob', 'users', 'mysql');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sql).toContain('CREATE TABLE `users` (');
      expect(result.sql).toContain('`id` INT NOT NULL');
    }
  });

  it('quotes identifiers per dialect', () => {
    const sqlite = generateCreateTable('id,name\n1,Ada', 't', 'sqlite');
    const mssql = generateCreateTable('id,name\n1,Ada', 't', 'transactsql');
    expect(sqlite.ok && sqlite.sql).toContain('"t"');
    expect(mssql.ok && mssql.sql).toContain('[t]');
  });

  it('defaults the table name when blank', () => {
    const result = generateCreateTable('id\n1', '', 'postgresql');
    expect(result.ok && result.sql).toContain('"my_table"');
  });

  it('rejects an empty sample', () => {
    expect(generateCreateTable('', 'users', 'postgresql').ok).toBe(false);
  });

  it('rejects a JSON array of non-objects', () => {
    expect(generateCreateTable('[1, 2, 3]', 'users', 'postgresql').ok).toBe(false);
  });

  it('rejects malformed JSON starting with "["', () => {
    expect(generateCreateTable('[not json', 'users', 'postgresql').ok).toBe(false);
  });
});
