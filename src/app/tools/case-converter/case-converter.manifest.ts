import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'case-converter',
  title: 'Case Converter',
  description: 'Convert text between camelCase, snake_case, kebab-case, Title Case, and more.',
  category: 'text',
  keywords: [
    'case',
    'convert',
    'camelcase',
    'snake_case',
    'kebab-case',
    'title case',
    'pascalcase',
  ],
  route: '/tools/case-converter',
  load: () => import('./case-converter').then((m) => m.CaseConverter),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip-tested (fast-check): tokenize(convertCase(words, style)) recovers the original word list for every style but alternating, plus fuzzing that convertCase never throws.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
