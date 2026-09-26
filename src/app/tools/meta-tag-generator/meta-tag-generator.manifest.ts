import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'meta-tag-generator',
  title: 'Meta Tag Generator',
  description:
    'Builds a <head> meta tag block from title/description/viewport/charset/robots/canonical fields.',
  category: 'developer',
  keywords: ['meta tags', 'seo', 'head tags', 'viewport', 'canonical', 'robots meta'],
  route: '/tools/meta-tag-generator',
  load: () => import('./meta-tag-generator').then((m) => m.MetaTagGenerator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
