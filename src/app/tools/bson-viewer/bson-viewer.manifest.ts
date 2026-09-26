import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'bson-viewer',
  title: 'BSON Viewer',
  description: 'Decode a BSON file and inspect its structure.',
  category: 'data',
  keywords: ['bson', 'mongodb', 'decode', 'binary', 'inspect'],
  route: '/tools/bson-viewer',
  load: () => import('./bson-viewer').then((m) => m.BsonViewer),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
  },
  persistence: { input: 'none', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['file', 'bytes'], produces: ['json'] },
};
