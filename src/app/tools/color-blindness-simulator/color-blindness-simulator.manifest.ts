import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'color-blindness-simulator',
  title: 'Color Blindness Simulator',
  description:
    'Simulates protanopia, deuteranopia, and tritanopia on an uploaded image via a per-pixel canvas transform.',
  category: 'encoding',
  keywords: [
    'color blindness',
    'colour blindness',
    'protanopia',
    'deuteranopia',
    'tritanopia',
    'color vision deficiency',
    'accessibility',
  ],
  route: '/tools/color-blindness-simulator',
  load: () => import('./color-blindness-simulator').then((m) => m.ColorBlindnessSimulator),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['file'], produces: ['file'] },
};
