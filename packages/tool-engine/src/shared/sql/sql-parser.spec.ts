import { loadSqlParser, type SqlDialect } from "./sql-parser.js";

const DIALECTS: readonly SqlDialect[] = ['postgresql', 'mysql', 'mariadb', 'sqlite', 'transactsql'];

describe('loadSqlParser', () => {
  it.each(DIALECTS)('loads a working %s parser', async (dialect) => {
    const parser = await loadSqlParser(dialect);
    expect(parser.astify('SELECT 1', { database: dialect })).toBeTruthy();
  });

  it('returns the same promise and instance for repeat calls', async () => {
    const first = loadSqlParser('sqlite');
    expect(loadSqlParser('sqlite')).toBe(first);
    expect(await first).toBe(await loadSqlParser('sqlite'));
  });

  it('does not cache a rejected import, so a retry can succeed', async () => {
    vi.resetModules();
    vi.doMock('node-sql-parser/build/mariadb.js', () => {
      throw new Error('chunk load failed');
    });
    try {
      const fresh = await import("./sql-parser.js");
      await expect(fresh.loadSqlParser('mariadb')).rejects.toThrow();
      vi.doUnmock('node-sql-parser/build/mariadb.js');
      expect((await fresh.loadSqlParser('mariadb')).astify('SELECT 1', { database: 'mariadb' })).toBeTruthy();
    } finally {
      vi.doUnmock('node-sql-parser/build/mariadb.js');
      vi.resetModules();
    }
  });
});
