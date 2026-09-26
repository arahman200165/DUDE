import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'sql-formatter-tool',
  desktopOpen: { extensions: ['.sql'], inputKey: 'input' },
  title: 'SQL Formatter / Minifier',
  description:
    'Pretty-prints or minifies SQL across PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, and Oracle (PL/SQL) dialects.',
  category: 'data',
  keywords: ['sql', 'format', 'minify', 'beautify', 'pretty-print'],
  route: '/tools/sql-formatter-tool',
  load: () => import('./sql-formatter-tool').then((m) => m.SqlFormatterTool),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
