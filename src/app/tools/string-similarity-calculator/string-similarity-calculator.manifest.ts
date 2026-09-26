import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'string-similarity-calculator',
  title: 'String Similarity Calculator',
  shortTitle: 'String Similarity',
  description:
    'Compares two strings with Levenshtein distance/similarity and Jaro-Winkler similarity.',
  category: 'text',
  keywords: [
    'similarity',
    'levenshtein',
    'jaro-winkler',
    'edit distance',
    'compare',
    'fuzzy match',
  ],
  route: '/tools/string-similarity-calculator',
  load: () => import('./string-similarity-calculator').then((m) => m.StringSimilarityCalculator),
  status: 'stable',
  persistence: { input: 'session' },
  io: { accepts: ['text'], produces: ['json'] },
};
