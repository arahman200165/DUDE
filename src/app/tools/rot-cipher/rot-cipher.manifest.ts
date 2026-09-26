import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'rot-cipher',
  title: 'ROT13 / ROT47 Cipher',
  description: 'Applies the self-inverse ROT13 or ROT47 letter/character rotation cipher.',
  category: 'encoding',
  keywords: ['rot13', 'rot47', 'cipher', 'rotate', 'caesar', 'obfuscate'],
  route: '/tools/rot-cipher',
  load: () => import('./rot-cipher-tool').then((m) => m.RotCipherTool),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
