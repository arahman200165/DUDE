import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'json-query',
  title: 'JSONPath / JMESPath Tester',
  description: 'Query JSON with a JSONPath or JMESPath expression.',
  category: 'data',
  keywords: ['jsonpath', 'jmespath', 'query', 'json', 'filter', 'search'],
  route: '/tools/json-query',
  load: () => import('./json-query').then((m) => m.JsonQuery),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['json'] },
};
