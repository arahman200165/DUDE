import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'pixel-color-picker',
  title: 'Pixel Color Picker',
  description: 'Reads the exact color of any pixel in an uploaded image.',
  category: 'developer',
  keywords: ['color', 'pixel', 'eyedropper', 'picker', 'image'],
  route: '/tools/pixel-color-picker',
  load: () => import('./pixel-color-picker').then((m) => m.PixelColorPicker),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested pure ImageData pixel sampling for channel bounds and out-of-range nulls.',
  },
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
