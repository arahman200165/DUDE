import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'opengraph-preview',
  title: 'OpenGraph Preview',
  description:
    'Builds og:/twitter: meta tags and renders a live social-card preview, entirely from entered values -- no URL fetching.',
  category: 'developer',
  keywords: ['opengraph', 'og tags', 'twitter card', 'social preview', 'link preview'],
  route: '/tools/opengraph-preview',
  load: () => import('./opengraph-preview').then((m) => m.OpengraphPreview),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
