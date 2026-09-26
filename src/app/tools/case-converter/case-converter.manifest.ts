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
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
