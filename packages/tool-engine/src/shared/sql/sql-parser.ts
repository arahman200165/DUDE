/**
 * On-demand loader for `node-sql-parser`'s per-dialect builds (~276 kB each) so a SQL tool never
 * pulls the all-dialects build (~2.5 MB). Each build is a separate literal `import()` so bundlers
 * split them; the pure SQL logic takes the loaded parser as a parameter and stays synchronous.
 */
import type { Parser } from 'node-sql-parser';

export type SqlDialect = 'postgresql' | 'mysql' | 'mariadb' | 'sqlite' | 'transactsql';
export type SqlParser = InstanceType<typeof Parser>;

type ParserModule = { readonly Parser: new () => SqlParser };
// The builds are CommonJS: depending on the bundler/runtime `Parser` is on `default` or the namespace.
type InteropModule = ParserModule & { readonly default?: ParserModule };

const IMPORTERS: Record<SqlDialect, () => Promise<unknown>> = {
  postgresql: () => import('node-sql-parser/build/postgresql.js'),
  mysql: () => import('node-sql-parser/build/mysql.js'),
  mariadb: () => import('node-sql-parser/build/mariadb.js'),
  sqlite: () => import('node-sql-parser/build/sqlite.js'),
  transactsql: () => import('node-sql-parser/build/transactsql.js'),
};

const cache = new Map<SqlDialect, Promise<SqlParser>>();

/** Loads (once per dialect) a parser instance for `dialect`; a failed import is not cached, so a retry can succeed. */
export function loadSqlParser(dialect: SqlDialect): Promise<SqlParser> {
  let pending = cache.get(dialect);
  if (!pending) {
    pending = IMPORTERS[dialect]().then((loaded) => {
      const mod = loaded as InteropModule;
      return new (mod.default ?? mod).Parser();
    });
    cache.set(dialect, pending);
    pending.catch(() => {
      if (cache.get(dialect) === pending) cache.delete(dialect);
    });
  }
  return pending;
}
