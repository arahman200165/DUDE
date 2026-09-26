import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'box-shadow-generator',
  title: 'Box Shadow Generator',
  description: 'Builds a single or multi-layer CSS box-shadow declaration with a live preview.',
  category: 'developer',
  keywords: ['box-shadow', 'css shadow', 'drop shadow', 'inset shadow', 'css generator'],
  route: '/tools/box-shadow-generator',
  load: () => import('./box-shadow-generator').then((m) => m.BoxShadowGenerator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Generator-tested (fast-check): layer formatting matches list length, empty layers emit none, and declarations match.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
