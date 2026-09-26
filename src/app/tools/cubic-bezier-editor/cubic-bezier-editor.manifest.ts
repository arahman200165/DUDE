import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'cubic-bezier-editor',
  title: 'Cubic-Bezier Editor',
  description:
    'Interactive cubic-bezier() easing curve editor with draggable control points and a live animated preview.',
  category: 'developer',
  keywords: [
    'cubic-bezier',
    'easing',
    'timing-function',
    'css animation',
    'transition-timing-function',
  ],
  route: '/tools/cubic-bezier-editor',
  load: () => import('./cubic-bezier-editor').then((m) => m.CubicBezierEditor),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
