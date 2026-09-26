import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'jsonl-viewer',
  title: 'JSON Lines / NDJSON Viewer',
  shortTitle: 'JSON Lines Viewer',
  description: 'View newline-delimited JSON (NDJSON/JSON Lines) as a table or a JSON array.',
  category: 'data',
  keywords: ['jsonl', 'ndjson', 'json lines', 'newline delimited', 'table', 'array'],
  route: '/tools/jsonl-viewer',
  load: () => import('./jsonl-viewer').then((m) => m.JsonlViewer),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['table', 'json'] },
};
