import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'mock-data-studio',
  title: 'Mock Data Studio',
  description:
    'Generates schema-driven mock data by mapping field names to faker methods, exported as JSON, NDJSON, CSV, SQL, XML, or YAML.',
  category: 'developer',
  keywords: [
    'mock',
    'data',
    'faker',
    'schema',
    'generate',
    'fake',
    'test data',
    'sample data',
    'json',
    'sql',
    'xml',
    'yaml',
  ],
  route: '/tools/mock-data-studio',
  load: () => import('./mock-data-studio').then((m) => m.MockDataStudio),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested (fast-check) for core output shape and invariants.',
  },
  persistence: { input: 'local', preferences: 'local' },
  io: { accepts: ['json'], produces: ['table', 'json', 'text', 'file'] },
};

