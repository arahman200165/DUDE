import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'parquet-viewer',
  title: 'Parquet Viewer',
  description: 'Decode a Parquet file and view its rows as a table.',
  category: 'data',
  keywords: ['parquet', 'decode', 'binary', 'inspect', 'columnar'],
  route: '/tools/parquet-viewer',
  load: () => import('./parquet-viewer').then((m) => m.ParquetViewer),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check using core-only fuzz checks against arbitrary valid or malformed input.',
  },
  persistence: { input: 'none', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['file', 'bytes'], produces: ['table'] },
};
