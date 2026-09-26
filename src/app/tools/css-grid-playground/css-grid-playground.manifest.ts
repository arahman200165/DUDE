import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'css-grid-playground',
  title: 'CSS Grid Playground',
  description:
    'Interactively builds grid container and item-placement CSS with a live preview of editable, addable items.',
  category: 'developer',
  keywords: ['css grid', 'grid-template-columns', 'grid-column', 'grid-row', 'css generator'],
  route: '/tools/css-grid-playground',
  load: () => import('./css-grid-playground').then((m) => m.CssGridPlayground),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Generator-tested (fast-check): generated item placements correspond to HTML items and emitted CSS rules.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
