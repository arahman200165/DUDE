import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'css-animation-builder',
  title: 'CSS Animation Builder',
  description:
    'Builds an @keyframes block and its animation shorthand from an ordered list of percentage stops, with a live preview.',
  category: 'developer',
  keywords: ['css animation', 'keyframes', 'animation-timing-function', 'css generator'],
  route: '/tools/css-animation-builder',
  load: () => import('./css-animation-builder').then((m) => m.CssAnimationBuilder),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Generator-tested (fast-check): bounded animation settings and stops produce stable keyframes and shorthand CSS.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
