import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'compression-lab',
  title: 'Compression Lab',
  description:
    'Compresses or decompresses text or a file with gzip or deflate (native Compression Streams API), comparing before/after size and ratio.',
  category: 'encoding',
  keywords: ['compression', 'gzip', 'deflate', 'decompress', 'ratio', 'compression streams'],
  route: '/tools/compression-lab',
  load: () => import('./compression-lab').then((m) => m.CompressionLab),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text', 'file'], produces: ['file'] },
};
