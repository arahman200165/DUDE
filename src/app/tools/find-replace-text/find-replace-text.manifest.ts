import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'find-replace-text',
  title: 'Find & Replace',
  description: 'Literal (non-regex) find and replace, with case-sensitive and whole-word options.',
  category: 'text',
  keywords: ['find', 'replace', 'search', 'literal', 'case sensitive', 'whole word'],
  route: '/tools/find-replace-text',
  load: () => import('./find-replace-text').then((m) => m.FindReplaceText),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check) against findReplace: never throws, an empty search term is always a no-op, and matchCount is zero exactly when the output is unchanged.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
