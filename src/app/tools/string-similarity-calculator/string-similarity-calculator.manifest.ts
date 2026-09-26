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
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): neverThrows plus [0,1] score bounds, self-comparison identity, and forward/backward symmetry verified for arbitrary string pairs.',
  },
  persistence: { input: 'session' },
  io: { accepts: ['text'], produces: ['json'] },
};
