import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'http-header-inspector',
  title: 'HTTP Header Inspector / Builder',
  description:
    'Inspect pasted HTTP headers as key/value pairs, or build a header set from scratch.',
  category: 'web',
  keywords: ['http', 'header', 'headers', 'inspect', 'build', 'request', 'response'],
  route: '/tools/http-header-inspector',
  load: () => import('./http-header-inspector').then((m) => m.HttpHeaderInspector),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): parseHeaders/buildHeaders never throw and round-trip colon/newline-free pairs; describeHeader never throws and is case-insensitive.',
  },
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['text', 'json'], produces: ['json', 'text'] },
};
