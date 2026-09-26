import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'image-format-converter',
  title: 'Image Format Converter',
  description:
    'Converts an uploaded image between PNG, JPEG, WebP, and AVIF (where the browser supports encoding it).',
  category: 'documents',
  keywords: ['image', 'convert', 'png', 'jpeg', 'webp', 'avif', 'format'],
  route: '/tools/image-format-converter',
  load: () => import('./image-format-converter').then((m) => m.ImageFormatConverter),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['file'], produces: ['file'] },
};
