import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'text-tokenizer-ngram',
  title: 'Text Tokenizer & N-Gram Generator',
  shortTitle: 'Tokenizer / N-Grams',
  description:
    'Tokenizes text into words or sentences, or generates word- or character-level n-grams with counts.',
  category: 'text',
  keywords: ['tokenize', 'tokens', 'n-gram', 'ngram', 'word split', 'sentence split'],
  route: '/tools/text-tokenizer-ngram',
  load: () => import('./text-tokenizer-ngram').then((m) => m.TextTokenizerNGram),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
