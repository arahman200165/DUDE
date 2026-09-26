import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'accept-header-builder',
  title: 'Accept Header Builder',
  description:
    'Builds or parses an Accept header, weighting media types with q values and showing the resulting preference order.',
  category: 'web',
  keywords: ['accept', 'header', 'media type', 'content negotiation', 'q value', 'mime'],
  route: '/tools/accept-header-builder',
  load: () => import('./accept-header-builder').then((m) => m.AcceptHeaderBuilder),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
