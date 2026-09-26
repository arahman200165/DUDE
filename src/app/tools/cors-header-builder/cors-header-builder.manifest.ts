import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'cors-header-builder',
  title: 'CORS Header Builder',
  description:
    'Builds the CORS response headers and checks whether a hypothetical request would pass preflight — construct-and-display, never a real request.',
  category: 'web',
  keywords: ['cors', 'cross-origin', 'header', 'preflight', 'access-control', 'origin'],
  route: '/tools/cors-header-builder',
  load: () => import('./cors-header-builder').then((m) => m.CorsHeaderBuilder),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): header parse/build and preflight evaluation never throw on arbitrary input, with header text round-tripping and preflight allowed iff no reasons.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
