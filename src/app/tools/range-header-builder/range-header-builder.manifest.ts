import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'range-header-builder',
  title: 'Range Header Builder',
  description:
    'Builds or parses a request Range header (single or multi-range, including open-ended and suffix ranges) and a response Content-Range header.',
  category: 'web',
  keywords: ['range', 'content-range', 'header', 'bytes', 'partial content', '206'],
  route: '/tools/range-header-builder',
  load: () => import('./range-header-builder').then((m) => m.RangeHeaderBuilder),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
