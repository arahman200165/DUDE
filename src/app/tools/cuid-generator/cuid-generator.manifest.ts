import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'cuid-generator',
  title: 'CUID Generator',
  description:
    'Generates collision-resistant CUID2 identifiers with a configurable count and length.',
  category: 'developer',
  keywords: ['cuid', 'cuid2', 'generate', 'identifier', 'collision-resistant'],
  route: '/tools/cuid-generator',
  load: () => import('./cuid-generator').then((m) => m.CuidGenerator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['json'], produces: ['text'] },
};
