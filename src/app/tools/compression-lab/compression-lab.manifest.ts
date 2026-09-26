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
  status: 'verified',
  verification: {
    crossChecked: ["Node's built-in zlib gzip, deflate, and deflate-raw compressors/decompressors"],
    propertyTested: true,
    summary: 'Native gzip/deflate/deflate-raw streams interoperate with Node zlib in both directions; round-trip property-tested (fast-check) for arbitrary bytes, plus computeStats invariants.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text', 'file'], produces: ['file'] },
};
