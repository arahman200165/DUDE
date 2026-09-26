import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'image-compressor',
  title: 'Image Compressor',
  description:
    'Compresses an uploaded image to JPEG, WebP, or PNG with an adjustable quality level and a before/after size comparison.',
  category: 'documents',
  keywords: ['image', 'compress', 'optimize', 'jpeg', 'webp', 'png', 'file size'],
  route: '/tools/image-compressor',
  load: () => import('./image-compressor').then((m) => m.ImageCompressor),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['file'], produces: ['file'] },
};
