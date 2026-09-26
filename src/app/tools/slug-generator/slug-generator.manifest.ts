import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'slug-generator',
  title: 'Slug Generator',
  description: 'Turn a title into a URL-friendly slug, with transliteration and length control.',
  category: 'text',
  keywords: ['slug', 'url', 'permalink', 'seo', 'transliterate', 'hyphenate'],
  route: '/tools/slug-generator',
  load: () => import('./slug-generator').then((m) => m.SlugGenerator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
