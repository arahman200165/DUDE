import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'css-transform-builder',
  title: 'CSS Transform Builder',
  description:
    'Builds a CSS transform declaration from translate, rotate, scale, and skew controls, with a live preview.',
  category: 'developer',
  keywords: [
    'css transform',
    'translate',
    'rotate',
    'scale',
    'skew',
    'transform-origin',
    'css generator',
  ],
  route: '/tools/css-transform-builder',
  load: () => import('./css-transform-builder').then((m) => m.CssTransformBuilder),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
