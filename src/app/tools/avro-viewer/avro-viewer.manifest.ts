import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'avro-viewer',
  title: 'Avro Viewer',
  description: 'Decode an uncompressed Avro Object Container File and inspect its records.',
  category: 'data',
  keywords: ['avro', 'decode', 'binary', 'inspect', 'schema'],
  route: '/tools/avro-viewer',
  load: () => import('./avro-viewer').then((m) => m.AvroViewer),
  status: 'stable',
  persistence: { input: 'none', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['file', 'bytes'], produces: ['json'] },
};
