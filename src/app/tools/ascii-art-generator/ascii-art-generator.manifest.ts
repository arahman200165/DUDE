import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'ascii-art-generator',
  title: 'ASCII Art Generator / Banner',
  shortTitle: 'ASCII Art',
  description: 'Renders text as an ASCII-art banner, with a choice of FIGlet fonts.',
  category: 'text',
  keywords: ['ascii art', 'banner', 'figlet', 'text art', 'font'],
  route: '/tools/ascii-art-generator',
  load: () => import('./ascii-art-generator').then((m) => m.AsciiArtGenerator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
