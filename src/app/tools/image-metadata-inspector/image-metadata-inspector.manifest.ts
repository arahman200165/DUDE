import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'image-metadata-inspector',
  title: 'Image Metadata Inspector',
  description:
    "Reports an uploaded image's file size, detected format, pixel dimensions, and (for PNG) bit depth and color type.",
  category: 'documents',
  keywords: [
    'image',
    'metadata',
    'dimensions',
    'png',
    'ihdr',
    'bit depth',
    'color type',
    'inspector',
  ],
  route: '/tools/image-metadata-inspector',
  load: () => import('./image-metadata-inspector').then((m) => m.ImageMetadataInspector),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check) the pure PNG IHDR parser against arbitrary bytes (never throws, always returns null or a well-shaped record) and against synthesized well-formed IHDR chunks (exact field round-trip).',
  },
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
