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
    vectors: ['Pillow-generated 37-by-23 RGB PNG golden fixture; exact IHDR metadata asserted'],
    crossChecked: ['Pillow 12.3.0 (Python 3.13.14) generated and reopened the PNG fixture'],
    propertyTested: true,
    summary: 'Matches IHDR metadata from an independently generated and Pillow-reopened RGB PNG fixture; fuzz-tested (fast-check) against arbitrary bytes and synthesized well-formed IHDR chunks.',
  },
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
