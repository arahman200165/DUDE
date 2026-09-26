import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'ini-formatter',
  desktopOpen: { extensions: ['.ini'], inputKey: 'input' },
  title: 'INI Formatter / Parser',
  description: 'Convert between INI and JSON, in either direction.',
  category: 'data',
  keywords: ['ini', 'format', 'parse', 'config', 'sections'],
  route: '/tools/ini-formatter',
  load: () => import('./ini-formatter').then((m) => m.IniFormatter),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['json', 'text'] },
};
