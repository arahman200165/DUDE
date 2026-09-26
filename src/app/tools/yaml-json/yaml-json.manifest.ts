import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'yaml-json',
  desktopOpen: { extensions: ['.yaml', '.yml'], inputKey: 'input' },
  title: 'YAML ↔ JSON Converter',
  description: 'Convert between YAML and JSON, in either direction.',
  category: 'data',
  keywords: ['yaml', 'json', 'convert', 'yml', 'data'],
  route: '/tools/yaml-json',
  load: () => import('./yaml-json').then((m) => m.YamlJson),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['json', 'text'] },
};
