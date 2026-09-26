import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'text-inspector',
  desktopOpen: { extensions: ['.txt'], inputKey: 'text' },
  title: 'Text Inspector',
  description:
    'Character, word, line, and byte metrics for any text, plus readability scoring, language detection, and grammar checking.',
  category: 'text',
  keywords: [
    'text',
    'inspector',
    'count',
    'characters',
    'words',
    'lines',
    'bytes',
    'metrics',
    'readability',
    'flesch',
    'language detection',
    'grammar',
  ],
  route: '/tools/text-inspector',
  load: () => import('./text-inspector').then((m) => m.TextInspector),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  network: { required: true, detail: 'LanguageTool API' },
  io: { accepts: ['text'], produces: ['json'] },
};
