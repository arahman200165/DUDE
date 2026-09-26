import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'image-resizer',
  title: 'Image Resizer',
  description:
    'Resizes an uploaded image to explicit dimensions or a percentage scale, with optional aspect-ratio lock.',
  category: 'documents',
  keywords: ['image', 'resize', 'scale', 'dimensions', 'canvas'],
  route: '/tools/image-resizer',
  load: () => import('./image-resizer').then((m) => m.ImageResizer),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['file'], produces: ['file'] },
};
