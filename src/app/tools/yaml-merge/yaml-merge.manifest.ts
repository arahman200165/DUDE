import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'yaml-merge',
  title: 'YAML Merge',
  description: 'Deep-merge two YAML documents into one.',
  category: 'data',
  keywords: ['yaml', 'merge', 'combine', 'deep merge'],
  route: '/tools/yaml-merge',
  load: () => import('./yaml-merge').then((m) => m.YamlMerge),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text'], produces: ['text'] },
};
