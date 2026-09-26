import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'properties-parser',
  title: 'Properties File Parser',
  description: 'Convert between Java-style .properties files and JSON, in either direction.',
  category: 'data',
  keywords: ['properties', 'java', 'parse', 'config', 'key value'],
  route: '/tools/properties-parser',
  load: () => import('./properties-parser').then((m) => m.PropertiesParser),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['json', 'text'] },
};
