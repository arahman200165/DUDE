import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'schema-diff',
  title: 'Schema Diff',
  description: 'Diffs two CREATE TABLE statements, reporting added, removed, and changed columns.',
  category: 'data',
  keywords: ['sql', 'schema', 'diff', 'compare', 'create table', 'ddl'],
  route: '/tools/schema-diff',
  load: () => import('./schema-diff').then((m) => m.SchemaDiff),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
