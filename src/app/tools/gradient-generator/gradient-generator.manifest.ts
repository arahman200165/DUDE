import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'gradient-generator',
  title: 'Gradient Generator',
  description:
    'Builds a CSS linear, radial, or conic gradient from editable color stops, with a live preview.',
  category: 'encoding',
  keywords: [
    'gradient',
    'linear-gradient',
    'radial-gradient',
    'conic-gradient',
    'css gradient',
    'color stops',
  ],
  route: '/tools/gradient-generator',
  load: () => import('./gradient-generator').then((m) => m.GradientGenerator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
