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
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check) against computeKeywordFrequency: never throws, every entry meets the minimum length with a count of at least 1, and results are sorted by descending count.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['table'] },
};
