import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'http-status',
  title: 'HTTP Status Code Reference',
  description: 'Searchable reference of every IANA-registered HTTP status code.',
  category: 'web',
  keywords: ['http', 'status', 'code', 'response', 'reference', '404', '500'],
  route: '/tools/http-status',
  load: () => import('./http-status').then((m) => m.HttpStatus),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): filterHttpStatusCodes never throws, an empty filter returns every entry correctly grouped/sorted, and a non-empty filter only returns matching entries.',
  },
  persistence: { input: 'local', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
