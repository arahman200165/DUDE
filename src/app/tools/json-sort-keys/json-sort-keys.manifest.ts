import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'json-sort-keys',
  title: 'JSON Sort Keys',
  description: "Sort a JSON document's object keys alphabetically, top-level or recursively.",
  category: 'data',
  keywords: ['json', 'sort', 'keys', 'alphabetical', 'order', 'normalize'],
  route: '/tools/json-sort-keys',
  load: () => import('./json-sort-keys').then((m) => m.JsonSortKeys),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check using fuzz checks against arbitrary valid or malformed input.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['json'] },
};
