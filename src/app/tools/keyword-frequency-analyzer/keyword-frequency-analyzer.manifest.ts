import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'keyword-frequency-analyzer',
  title: 'Keyword Frequency Analyzer',
  shortTitle: 'Keyword Frequency',
  description:
    'Counts word frequency in text, with stop-word filtering and a minimum-length filter.',
  category: 'text',
  keywords: ['keyword', 'frequency', 'word count', 'stop words', 'analysis', 'tf'],
  route: '/tools/keyword-frequency-analyzer',
  load: () => import('./keyword-frequency-analyzer').then((m) => m.KeywordFrequencyAnalyzer),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['table'] },
};
