import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'border-radius-generator',
  title: 'Border Radius Generator',
  description:
    'Builds a CSS border-radius declaration from linked or independent corner values, with a live preview.',
  category: 'developer',
  keywords: ['border-radius', 'css rounded corners', 'css generator'],
  route: '/tools/border-radius-generator',
  load: () => import('./border-radius-generator').then((m) => m.BorderRadiusGenerator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
