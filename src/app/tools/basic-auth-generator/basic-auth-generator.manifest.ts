import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'basic-auth-generator',
  title: 'Basic Auth Header Generator',
  shortTitle: 'Basic Auth',
  description:
    'Builds (or decodes) an HTTP Basic Authorization header from a username and password.',
  category: 'security',
  keywords: [
    'basic auth',
    'authorization header',
    'base64',
    'http auth',
    'credentials',
    'www-authenticate',
  ],
  route: '/tools/basic-auth-generator',
  load: () => import('./basic-auth-generator').then((m) => m.BasicAuthGenerator),
  status: 'verified',
  verification: {
    vectors: ['RFC 7617 Section 2 Aladdin/open sesame Authorization example'],
    propertyTested: true,
    summary: 'decodeBasicAuthHeader(buildBasicAuthHeader(u, p)) recovers u/p exactly for any generated colon-free username and arbitrary password (fast-check property test).',
  },
  consequenceClass: ['authentication'],
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
