import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'sqlite-viewer',
  title: 'SQLite File Viewer',
  description: 'Browse the tables in a SQLite file, read-only, entirely client-side.',
  category: 'data',
  keywords: ['sqlite', 'sql', 'database', 'db', 'inspect', 'browse'],
  route: '/tools/sqlite-viewer',
  load: () => import('./sqlite-viewer').then((m) => m.SqliteViewer),
  status: 'stable',
  persistence: { input: 'none', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['file', 'bytes'], produces: ['table'] },
};
