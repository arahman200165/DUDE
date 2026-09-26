import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'sql-parameterizer',
  title: 'SQL Parameterizer',
  description:
    'Replaces literal values in a SQL query with placeholders (?, $n, or :named), extracting the values as a parameter list.',
  category: 'data',
  keywords: ['sql', 'parameterize', 'placeholder', 'prepared statement', 'bind variable'],
  route: '/tools/sql-parameterizer',
  load: () => import('./sql-parameterizer').then((m) => m.SqlParameterizer),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
