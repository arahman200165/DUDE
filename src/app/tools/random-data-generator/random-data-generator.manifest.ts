import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'random-data-generator',
  title: 'Random Data Generator',
  description:
    'Generate realistic fake data — names, addresses, internet, finance, and more — as a table, CSV, or JSON.',
  category: 'developer',
  keywords: ['random', 'fake', 'faker', 'mock', 'data', 'generate', 'test data', 'sample data'],
  route: '/tools/random-data-generator',
  load: () => import('./random-data-generator').then((m) => m.RandomDataGenerator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested generated row dimensions and same-seed determinism across selected fields.',
  },
  persistence: { input: 'local', preferences: 'local' },
  io: { accepts: ['json'], produces: ['table', 'json', 'text'] },
};
