import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'html-entity-explorer',
  title: 'HTML Entity Explorer',
  description:
    'Searchable reference of common named HTML character entities, with decimal and hex codepoints.',
  category: 'developer',
  keywords: [
    'html entities',
    'named entities',
    'character reference',
    'nbsp',
    'copy',
    'entity reference',
  ],
  route: '/tools/html-entity-explorer',
  load: () => import('./html-entity-explorer').then((m) => m.HtmlEntityExplorer),
  status: 'stable',
  persistence: { input: 'local', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
