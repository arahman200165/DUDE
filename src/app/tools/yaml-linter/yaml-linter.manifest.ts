import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'yaml-linter',
  title: 'YAML Linter',
  description: 'Validate YAML and surface parse errors with line and column detail.',
  category: 'data',
  keywords: ['yaml', 'lint', 'validate', 'syntax', 'error'],
  route: '/tools/yaml-linter',
  load: () => import('./yaml-linter').then((m) => m.YamlLinter),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text'], produces: ['text'] },
};
