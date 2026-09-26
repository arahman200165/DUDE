import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'sql-dialect-converter',
  title: 'SQL Dialect Converter',
  description:
    'Converts SQL between PostgreSQL, MySQL, MariaDB, SQLite, and SQL Server, best-effort.',
  category: 'data',
  keywords: ['sql', 'dialect', 'convert', 'postgresql', 'mysql', 'mariadb', 'sqlite', 'sql server'],
  route: '/tools/sql-dialect-converter',
  load: () => import('./sql-dialect-converter').then((m) => m.SqlDialectConverter),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested with arbitrary text across every dialect pair (fast-check) -- never throws.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
