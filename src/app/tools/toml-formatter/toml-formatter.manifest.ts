import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'toml-formatter',
  desktopOpen: { extensions: ['.toml'], inputKey: 'input' },
  title: 'TOML Formatter / Validator',
  description: 'Validate and reformat TOML.',
  category: 'data',
  keywords: ['toml', 'format', 'validate', 'config'],
  route: '/tools/toml-formatter',
  load: () => import('./toml-formatter').then((m) => m.TomlFormatter),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text'], produces: ['text'] },
};
