import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'json-flatten',
  title: 'JSON Flatten / Unflatten',
  description:
    'Flatten nested JSON into dot/bracket-notation path keys, or unflatten them back into nested JSON.',
  category: 'data',
  keywords: ['json', 'flatten', 'unflatten', 'dot notation', 'nested', 'path', 'keys'],
  route: '/tools/json-flatten',
  load: () => import('./json-flatten').then((m) => m.JsonFlatten),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check using fuzz checks against arbitrary valid or malformed input.',
  },
  persistence: { input: 'session', preferences: 'local' },
  fileInput: { key: 'input', extensions: ['.json'] },
  execution: { worker: 'optional' },
  io: { accepts: ['json', 'text', 'file'], produces: ['json', 'text', 'file'] },
};
