import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'slug-generator',
  title: 'Slug Generator',
  description: 'Turn a title into a URL-friendly slug, with transliteration and length control.',
  category: 'text',
  keywords: ['slug', 'url', 'permalink', 'seo', 'transliterate', 'hyphenate'],
  route: '/tools/slug-generator',
  load: () => import('./slug-generator').then((m) => m.SlugGenerator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Generator-tested (fast-check): output format (lowercase alnum + separator, no stray separators), maxLength bound, and determinism verified across the option space.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
