import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'flexbox-playground',
  title: 'Flexbox Playground',
  description:
    'Interactively builds flex container and item CSS with a live preview of editable, addable items.',
  category: 'developer',
  keywords: ['flexbox', 'flex', 'css flexbox', 'justify-content', 'align-items', 'css generator'],
  route: '/tools/flexbox-playground',
  load: () => import('./flexbox-playground').then((m) => m.FlexboxPlayground),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Generator-tested (fast-check): generated item settings produce matching HTML items and CSS rules.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
