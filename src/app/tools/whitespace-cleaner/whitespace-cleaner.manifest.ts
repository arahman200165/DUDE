import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'whitespace-cleaner',
  title: 'Whitespace Cleaner / Normalizer',
  description:
    'Trim, collapse, and normalize whitespace, line endings, tabs/spaces, and indentation.',
  category: 'text',
  keywords: [
    'whitespace',
    'trim',
    'clean',
    'normalize',
    'line endings',
    'tabs',
    'spaces',
    'invisible',
    'indent',
    'reindent',
  ],
  route: '/tools/whitespace-cleaner',
  load: () => import('./whitespace-cleaner').then((m) => m.WhitespaceCleaner),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
