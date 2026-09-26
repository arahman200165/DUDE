import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'create-table-generator',
  title: 'CREATE TABLE Generator',
  description:
    'Infers column types from a pasted JSON array or CSV sample and generates dialect-specific CREATE TABLE DDL.',
  category: 'data',
  keywords: ['sql', 'create table', 'ddl', 'schema', 'generate', 'csv', 'json'],
  route: '/tools/create-table-generator',
  load: () => import('./create-table-generator').then((m) => m.CreateTableGenerator),
  status: 'stable',
  persistence: { input: 'local', preferences: 'local' },
  io: { accepts: ['text', 'json'], produces: ['text'] },
};
