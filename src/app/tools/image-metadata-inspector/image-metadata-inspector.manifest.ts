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
  status: 'stable',
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
