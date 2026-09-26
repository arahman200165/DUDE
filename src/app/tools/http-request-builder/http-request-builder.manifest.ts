import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'http-request-builder',
  title: 'HTTP Request Builder / Converter',
  description:
    'Build an HTTP request from fields or paste a raw HTTP/1.1 request, then export it as cURL, raw HTTP, or any of the cURL converter language targets.',
  category: 'web',
  keywords: ['http', 'request', 'builder', 'raw http', 'curl', 'export', 'convert'],
  route: '/tools/http-request-builder',
  load: () => import('./http-request-builder').then((m) => m.HttpRequestBuilder),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip and fuzz-tested (fast-check): generateRawHttp/parseHttpRequestText recover method/url/queryParams/headers for a bodyless, auth-less https request, plus neverThrows on arbitrary text.',
  },
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text', 'json', 'url', 'http-response'], produces: ['json', 'text'] },
};
