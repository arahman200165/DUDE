import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'duplicate-finder',
  title: 'Duplicate Finder',
  description:
    'Finds duplicate lines or duplicate words in text, with counts and one-click removal.',
  category: 'text',
  keywords: ['duplicate', 'dedupe', 'lines', 'words', 'unique', 'remove duplicates'],
  route: '/tools/duplicate-finder',
  load: () => import('./duplicate-finder').then((m) => m.DuplicateFinder),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json', 'text'] },
};
