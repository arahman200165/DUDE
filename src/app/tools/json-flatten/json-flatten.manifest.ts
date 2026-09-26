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
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['json', 'text'], produces: ['json', 'text'] },
};
