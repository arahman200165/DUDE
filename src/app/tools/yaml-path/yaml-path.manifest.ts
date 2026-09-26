import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'yaml-path',
  title: 'YAML Path Tester',
  description: 'Query a YAML document with a JSONPath or JMESPath expression.',
  category: 'data',
  keywords: ['yaml', 'jsonpath', 'jmespath', 'query', 'path', 'filter'],
  route: '/tools/yaml-path',
  load: () => import('./yaml-path').then((m) => m.YamlPath),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text'], produces: ['json'] },
};
