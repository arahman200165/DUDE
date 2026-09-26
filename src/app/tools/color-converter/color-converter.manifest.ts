import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'color-converter',
  title: 'Color Converter',
  description: 'Convert between HEX, RGB, HSL, HSV, CMYK, and named CSS colors.',
  category: 'encoding',
  keywords: ['color', 'colour', 'hex', 'rgb', 'hsl', 'hsv', 'cmyk', 'convert', 'css color'],
  route: '/tools/color-converter',
  load: () => import('./color-converter').then((m) => m.ColorConverter),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
